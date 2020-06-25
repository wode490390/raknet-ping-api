const http = require('http'),
    https = require('https'),
    url = require('url'),
    fs = require('fs'),
    dgram = require('dgram');

var INT64_0 = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

const MAGIC = [0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78],
    ID_UNCONNECTED_PONG = 0x1c,
    PING_DATA = Buffer.from([0x01].concat(INT64_0).concat(MAGIC).concat(INT64_0));

INT64_0 = null;

var config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
config.http.enable = config.http.enable || true;
config.http.host = config.http.host || '0.0.0.0';
config.http.port = config.http.port || 80;
config.https.enable = config.https.enable || false;
config.https.host = config.https.host || '0.0.0.0';
config.https.port = config.https.port || 443;
config.https.cert = config.https.cert || 'cert.pem';
config.https.cert_key = config.https.cert_key || 'key.pem';
config.cors = config.cors || '*';
config.timeout = config.timeout || 5000;

var app = function(request, response){
    let query = url.parse(request.url, true).query || {},
        host =  query.host,
        result = {},
        client,
        timer,

        _finish = function(err){
            try {
                clearTimeout(timer);
                client.close();
            } catch (e) {}

            if (err) {
                result.error = err.message;
            }
            result = JSON.stringify(result);

            try {
                response.setHeader('Access-Control-Allow-Origin', config.cors);
                if (query.callback) {
                    response.writeHead(200, {
                        'Content-Type': 'application/javascript'
                    });
                    response.end(`${query.callback}('${result}')`);
                } else {
                    response.writeHead(200, {
                        'Content-Type': 'application/json'
                    });
                    response.end(result);
                }
            } catch (responded) {
                response.end('');
            }
        };

    if (host) {
        let client = dgram.createSocket('udp4');

        client.on('listening', () => {
            timer = setTimeout(() => {
                try {
                    _finish(new Error('Timeout'));
                } catch (e) {}
            }, config.timeout);
            try {
                client.send(PING_DATA, query.port || 19132, host, (err) => {});
            } catch (err) {
                _finish(err);
            }
        });

        client.on('message', (msg, rinfo) => {
            try {
                if ((msg.readInt8(0) & 0xff) === ID_UNCONNECTED_PONG) {
                    let serverName = msg.toString('utf8', 35).split(';');
                    switch (serverName.length) {
                        case 0:
                            break;
                        default:
                            if (serverName.length > 12) {
                                result.extras = [];
                                for (let i = 12, j = 0; i < serverName.length; i++, j++) {
                                    result.extras[j] = serverName[i];
                                }
                            }
                        case 12:
                            result.ipv6Port = serverName[11];
                        case 11:
                            result.ipv4Port = serverName[10];
                        case 10:
                            result.nintendoLimited = serverName[9] == 0;
                        case 9:
                            result.type = serverName[8];
                        case 8:
                            result.subMotd = serverName[7];
                        case 7:
                            result.id = serverName[6];
                        case 6:
                            result.maxPlayer = serverName[5];
                        case 5:
                            result.player = serverName[4];
                        case 4:
                            result.version = serverName[3];
                        case 3:
                            result.protocol = serverName[2];
                        case 2:
                            result.motd = serverName[1];
                        case 1:
                            result.game = serverName[0];
                    }
                    result.address = rinfo.address;
                    _finish();
                }
            } catch (err) {
                _finish(err);
            }
        });

        client.on('error', (err) => {
            _finish(err);
        });

        client.bind(Math.floor(Math.random() * 40001 + 20000));
    } else {
        _finish();
    }
};

if (config.http.enable) {
    http.createServer(app).listen(config.http.port, config.http.host);
    console.log(`Http server is running at http://${config.http.host}:${config.http.port}`);
}
if (config.https.enable) {
    https.createServer({
        key: fs.readFileSync(config.https.cert_key),
        cert: fs.readFileSync(config.https.cert)
    }, app).listen(config.https.port, config.https.host);
    console.log(`Https server is running at https://${config.https.host}:${config.https.port}`);
}

/* Example (play.easecation.net:19132)
GET http://127.0.0.1/?host=play.easecation.net&port=19132
{
    "nintendoLimited": false,
    "type": "Survival",
    "subMotd": "Powered by Nemisys",
    "id": "-1710095389442363679",
    "maxPlayer": "15340",
    "player": "878",
    "version": "1.12.1",
    "protocol": "140",
    "motd": "§l§aEase§6Cation§r§c CHINA §r§7§kEC§r §l§bCRYSTAL §eWARS§r §7§kEC§r",
    "game": "MCPE",
    "address": "42.186.61.20"
}
*/
