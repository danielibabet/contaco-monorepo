import { CustomMessageTriggerEvent } from 'aws-lambda';

export const handler = async (event: CustomMessageTriggerEvent): Promise<CustomMessageTriggerEvent> => {
  const code = event.request.codeParameter;
  const username = event.userName || 'Usuario';
  const logoUrl = 'https://contaco.vercel.app/logo-contaco.png';

  const baseHtml = (title: string, message: string) => `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7f9; color: #334155;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7f9; padding: 60px 20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; max-width: 600px; width: 100%; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02); overflow: hidden;">
              <!-- Header with Logo -->
              <tr>
                <td style="padding: 40px 40px 20px 40px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #f1f5f9;">
                  <img src="${logoUrl}" alt="ContaCo Logo" style="height: 48px; width: auto; object-fit: contain; margin-bottom: 0;">
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 24px 0; color: #0f172a; font-size: 24px; font-weight: 700; text-align: center;">${title}</h2>
                  <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                    Hola,
                    <br><br>
                    ${message}
                  </p>
                  
                  <!-- Verification Code Box -->
                  <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; text-align: center; margin-bottom: 32px; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.02);">
                    <p style="margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 1.5px; margin-bottom: 12px;">Tu Código de Seguridad</p>
                    <span style="display: inline-block; font-size: 36px; font-weight: 800; color: #4f46e5; letter-spacing: 12px; font-family: monospace; background-color: #ffffff; padding: 12px 24px; border-radius: 8px; border: 1px dashed #cbd5e1;">
                      ${code}
                    </span>
                  </div>
                  
                  <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.6; text-align: center;">
                    Si no solicitaste este código, por favor ignora este correo. Por seguridad, este código expirará en unos minutos.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding: 24px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8; font-weight: 500;">
                    El equipo de ContaCo
                  </p>
                  <p style="margin: 0; font-size: 12px; color: #cbd5e1;">
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
    event.response.emailSubject = '¡Bienvenido a ContaCo! Código de Verificación';
    event.response.emailMessage = baseHtml(
      'Verifica tu cuenta de ContaCo',
      '¡Gracias por unirte a ContaCo! Para completar tu registro y acceder a todas las funcionalidades, introduce el siguiente código en la pantalla de verificación:'
    );
  } else if (event.triggerSource === 'CustomMessage_ForgotPassword') {
    event.response.emailSubject = 'Recuperación de contraseña - ContaCo';
    event.response.emailMessage = baseHtml(
      'Recupera tu contraseña',
      'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Si has sido tú, utiliza este código para crear una nueva contraseña segura:'
    );
  }

  return event;
};
