// The LangGraph runtime UI on AWS at the lowest standing cost: its standalone Next.js server
// on Lambda, under one path.
//
//   CloudFront ─┬─ <basePath>/_next/static/* ── cached (hashed, immutable files)
//               └─ everything else ──────────── Lambda Function URL (the server through the
//                                               Lambda Web Adapter, response streaming)
//
// The server is needed: Auth.js keeps the session in an encrypted cookie and the runtime
// proxy (/api/runtime) adds the user's token on the server. No VPC, load balancer or
// always-on compute: at dev traffic the cost is Lambda and CloudFront usage inside their
// free tiers plus cents of ECR storage. The public host (dev.tripleq.ai) is not here: the
// front door in dev-tripleq-frontdoor/ routes <basePath>/* to this distribution.

import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/** cdk.json "runtimeUi". */
interface RuntimeUiContext {
  /** The address people open, e.g. https://dev.tripleq.ai/agent-runtime-lg/ */
  publicUrl: string;
  /** The path the app is built for and served under (no trailing slash). */
  basePath: string;
  /** The LangGraph runtime the proxy forwards to. */
  runtimeApiUrl: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcScope: string;
  /** SecureString with the Auth.js secret (deploy.sh creates it once). */
  authSecretParameter: string;
}

export interface RuntimeUiStackProps extends cdk.StackProps {
  repositoryName: string;
  imageTag: string;
}

export class RuntimeUiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RuntimeUiStackProps) {
    super(scope, id, props);

    const settings: RuntimeUiContext = this.node.tryGetContext('runtimeUi') ?? {};
    const required = ['publicUrl', 'basePath', 'runtimeApiUrl', 'oidcIssuer', 'oidcClientId', 'authSecretParameter'] as const;
    const missing = required.filter((key) => !settings[key]);
    if (missing.length) throw new Error(`cdk.json context "runtimeUi" needs ${missing.join(', ')}`);
    const { basePath } = settings;
    if (!/^(\/[a-z0-9-]+)+$/.test(basePath)) throw new Error('runtimeUi.basePath must look like /agent-runtime-lg');
    const publicUrl = settings.publicUrl.replace(/\/+$/, '');

    // Encrypts the session cookie. deploy.sh passes it from the SecureString, which
    // CloudFormation cannot put in a Lambda environment itself; NoEcho keeps it out of the
    // stack's parameters and events.
    const authSecret = new cdk.CfnParameter(this, 'AuthSecret', {
      type: 'String',
      noEcho: true,
      minLength: 32,
      description: `Auth.js secret, from ${settings.authSecretParameter}`,
    });

    const logGroup = new logs.LogGroup(this, 'ServerLogs', {
      logGroupName: '/aws/lambda/zonic-agent-runtime-ui-langgraph',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const server = new lambda.DockerImageFunction(this, 'Server', {
      functionName: 'zonic-agent-runtime-ui-langgraph',
      description: 'LangGraph runtime UI (Next.js standalone server through the Lambda Web Adapter)',
      code: lambda.DockerImageCode.fromEcr(
        ecr.Repository.fromRepositoryName(this, 'Repository', props.repositoryName),
        { tagOrDigest: props.imageTag },
      ),
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      // A run's event stream passes through the proxy for as long as the run lasts.
      timeout: cdk.Duration.minutes(15),
      logGroup,
      environment: {
        RUNTIME_API_URL: settings.runtimeApiUrl,
        AUTH_SECRET: authSecret.valueAsString,
        // Auth.js takes its base path and the public origin from here: behind CloudFront the
        // request's own host is the Function URL's.
        AUTH_URL: `${publicUrl}/api/auth`,
        AUTH_TRUST_HOST: 'true',
        AUTH_OIDC_ISSUER: settings.oidcIssuer,
        AUTH_OIDC_CLIENT_ID: settings.oidcClientId,
        AUTH_OIDC_SCOPE: settings.oidcScope || 'openid email profile',
      },
    });

    // Public at the URL layer: pages need the session cookie and the proxy the user's token.
    const serverUrl = server.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });
    // Since October 2025 a public Function URL also needs lambda:InvokeFunction
    // granted through the URL; addFunctionUrl adds only lambda:InvokeFunctionUrl.
    new lambda.CfnPermission(this, 'ServerUrlInvokeFunction', {
      functionName: server.functionName,
      action: 'lambda:InvokeFunction',
      principal: '*',
      invokedViaFunctionUrl: true,
    });

    // Next.js serves the app's home at the base path without a slash, and would redirect the
    // published address (with one) to an absolute URL on the Function URL's host, the only host
    // it sees. A relative redirect here keeps the browser on the public host.
    const homeRedirect = new cloudfront.Function(this, 'HomeRedirect', {
      comment: 'Redirect <basePath>/ to <basePath>, relative to the public host',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  if (event.request.uri === '${basePath}/') {
    return { statusCode: 302, statusDescription: 'Found', headers: { location: { value: '${basePath}' } } };
  }
  return event.request;
}`),
    });

    const origin = new origins.FunctionUrlOrigin(serverUrl, {
      readTimeout: cdk.Duration.seconds(60),
      keepaliveTimeout: cdk.Duration.seconds(60),
    });
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'LangGraph runtime UI - reached through dev.tripleq.ai',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // A Function URL answers only to its own Host; cookies and the rest pass through.
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [{ function: homeRedirect, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        [`${basePath}/_next/static/*`]: {
          origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
        },
      },
    });

    new cdk.CfnOutput(this, 'AppUrl', { value: settings.publicUrl });
    new cdk.CfnOutput(this, 'AppBasePath', { value: basePath });
    new cdk.CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'ServerFunctionUrl', { value: serverUrl.url });
    new cdk.CfnOutput(this, 'OidcCallbackUrl', { value: `${publicUrl}/api/auth/callback/tripleq` });
  }
}
