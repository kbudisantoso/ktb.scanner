export default {
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: (process.env.SCANNER_DEV_ORIGINS ?? '')
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean),
};
