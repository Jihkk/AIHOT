export function officialUrl(value, hosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new Error('Expected an HTTPS link on the registered official source');
  return url.href;
}
