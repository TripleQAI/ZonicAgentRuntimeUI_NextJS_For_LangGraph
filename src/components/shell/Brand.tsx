import { t } from '@/lib/i18n/t';

/**
 * The TripleQ AI mark, as the welcome site's header draws it: the logo icon and the wordmark, with
 * the Q bold in the accent. `product` adds the product name after a divider.
 */
export function Brand({ product = false, size = 'md' }: { product?: boolean; size?: 'md' | 'lg' }) {
  const large = size === 'lg';
  return (
    <span className="flex items-center gap-2.5" aria-label={product ? t('brand.productName') : t('brand.name')} role="img">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimisation needed */}
      <img src="/tripleq-logo.png" alt="" width={73} height={71} className={large ? 'h-10 w-auto' : 'h-7 w-auto'} />
      <span aria-hidden className={`wordmark ${large ? 'text-2xl' : 'text-lg'}`}>
        <span className="font-light">{t('brand.wordmarkStart')}</span>
        <span className="font-bold text-primary">{t('brand.wordmarkAccent')}</span>
        <span className="font-light">{t('brand.wordmarkEnd')}</span>
      </span>
      {product && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-line" />
          <span aria-hidden className="text-sm font-medium text-tq-run">
            {t('app.name')}
          </span>
        </>
      )}
    </span>
  );
}
