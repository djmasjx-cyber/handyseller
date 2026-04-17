export const TMS_API_BASE =
  (process.env.NEXT_PUBLIC_TMS_API_URL ?? process.env.TMS_API_URL ?? 'http://localhost:4100').replace(
    /\/api\/?$/,
    '',
  ) + '/api';
