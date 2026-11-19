import { mariadbConfigFromUrl } from './prisma.js';

describe('mariadbConfigFromUrl', () => {
  it('en local deja la URL y permite pedir la llave pública del servidor', () => {
    const config = mariadbConfigFromUrl('mysql://u:p@localhost:3306/charanatech');
    expect(config).toBe('mysql://u:p@localhost:3306/charanatech?allowPublicKeyRetrieval=true');
  });

  it('no repite allowPublicKeyRetrieval si ya viene en la URL', () => {
    const config = mariadbConfigFromUrl(
      'mysql://u:p@localhost:3306/db?allowPublicKeyRetrieval=false',
    );
    expect(config).toBe('mysql://u:p@localhost:3306/db?allowPublicKeyRetrieval=false');
  });

  it('con sslcert conecta por TLS confiando solo en esa autoridad', () => {
    const readPaths: string[] = [];
    const readCa = (path: string) => {
      readPaths.push(path);
      return '-----BEGIN CERTIFICATE-----';
    };
    const config = mariadbConfigFromUrl(
      'mysql://charanatech:s3cr%40t@db.us-east-2.rds.amazonaws.com:3306/charanatech' +
        '?sslcert=/app/certs/rds-ca.pem&sslaccept=strict',
      readCa,
    );

    expect(readPaths).toEqual(['/app/certs/rds-ca.pem']);
    expect(config).toEqual({
      host: 'db.us-east-2.rds.amazonaws.com',
      port: 3306,
      user: 'charanatech',
      password: 's3cr@t',
      database: 'charanatech',
      ssl: { ca: '-----BEGIN CERTIFICATE-----', rejectUnauthorized: true },
    });
  });

  it('sslaccept=accept_invalid_certs desactiva la verificación (solo para pruebas)', () => {
    const config = mariadbConfigFromUrl(
      'mysql://u:p@h/db?sslcert=/ca.pem&sslaccept=accept_invalid_certs',
      () => 'ca',
    );
    expect(config).toMatchObject({ port: 3306, ssl: { rejectUnauthorized: false } });
  });
});
