import localtunnel from 'localtunnel';
const tunnel = await localtunnel({ port: 5181, subdomain: 'cqu-a' });
console.log('URL', tunnel.url);
tunnel.on('close', () => console.log('closed'));
