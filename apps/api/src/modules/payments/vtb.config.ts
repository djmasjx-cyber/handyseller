/**
 * Конфигурация ВТБ Эквайринг (sandbox.vtb.ru)
 * URL: TEST https://vtb.rbsuat.com/payment/rest/
 *      PROD https://platezh.vtb24.ru/payment/rest/
 */
export const VTB_CONFIG = {
  sandbox: {
    apiUrl: 'https://vtb.rbsuat.com/payment/rest',
  },
  production: {
    apiUrl: 'https://platezh.vtb24.ru/payment/rest',
  },
  get apiUrl() {
    return process.env.VTB_MODE === 'production'
      ? this.production.apiUrl
      : this.sandbox.apiUrl;
  },
  get userName() {
    return process.env.VTB_USER_NAME ?? '';
  },
  get password() {
    return process.env.VTB_PASSWORD ?? '';
  },
  get isConfigured() {
    return Boolean(this.userName && this.password);
  },
} as const;
