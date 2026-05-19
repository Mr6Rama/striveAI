const STRIVEAI_EXTENSION_ENV = 'local';

const STRIVEAI_URLS = {
  local: 'http://localhost:3000',
  production: 'https://example.com', // replace with real production domain when SSL/domain is ready
};

const STRIVEAI_APP_URL = STRIVEAI_URLS[STRIVEAI_EXTENSION_ENV] || STRIVEAI_URLS.local;
