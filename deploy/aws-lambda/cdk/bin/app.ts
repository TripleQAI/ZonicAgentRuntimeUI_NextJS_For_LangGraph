#!/usr/bin/env node
// Run by deploy/aws-lambda/deploy.sh, which pushes the image first and passes it as
//   -c repositoryName=<repo> -c imageTag=<tag>

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RuntimeUiStack } from '../lib/runtime-ui-stack';

const app = new cdk.App();

const repositoryName = app.node.tryGetContext('repositoryName');
const imageTag = app.node.tryGetContext('imageTag');
if (!repositoryName || !imageTag) {
  throw new Error('Pass -c repositoryName=<repo> -c imageTag=<tag> (deploy/aws-lambda/deploy.sh does)');
}

new RuntimeUiStack(app, 'AgentRuntimeUiLgStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  repositoryName,
  imageTag,
  // No bootstrap version rule and no assets (the deploy script pushes the image), so
  // deploy.sh hands the template straight to CloudFormation: no `cdk bootstrap`.
  synthesizer: new cdk.CliCredentialsStackSynthesizer(),
});
