import { CustomMessageTriggerEvent } from 'aws-lambda';

export const handler = async (event: CustomMessageTriggerEvent): Promise<CustomMessageTriggerEvent> => {
  const code = event.request.codeParameter;
  const username = event.userName || 'Usuario';

  const baseHtml = (title: string, message: string) => `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #334155;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 600px; width: 100%; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <tr>
                <td style="padding: 40px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                  <h1 style="margin: 0; color: #0f172a; font-size: 24px; font-weight: 700;">ContaCo</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 20px; font-weight: 600;">${title}</h2>
                  <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                    Hola,
                    <br><br>
                    ${message}
                  </p>
                  <div style="background-color: #f1f5f9; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 30px;">
                    <p style="margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 1px; margin-bottom: 8px;">Código de Verificación</p>
                    <span style="font-size: 32px; font-weight: 700; color: #4f46e5; letter-spacing: 8px;">${code}</span>
                  </div>
                  <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">
                    Si no solicitaste este código, por favor ignora este correo. El código expirará pronto.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
                  <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                    &copy; ${new Date().getFullYear()} ContaCo. Todos los derechos reservados.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  if (event.triggerSource === 'CustomMessage_SignUp') {
    event.response.emailSubject = '¡Bienvenido a ContaCo! Verifica tu cuenta';
    event.response.emailMessage = baseHtml(
      'Verifica tu cuenta de ContaCo',
      'Gracias por registrarte en ContaCo. Para completar tu registro y acceder a la plataforma, utiliza el siguiente código de verificación:'
    );
  } else if (event.triggerSource === 'CustomMessage_ForgotPassword') {
    event.response.emailSubject = 'Recuperación de contraseña de ContaCo';
    event.response.emailMessage = baseHtml(
      'Recupera tu contraseña',
      'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Utiliza el siguiente código para crear una nueva contraseña:'
    );
  }

  return event;
};
