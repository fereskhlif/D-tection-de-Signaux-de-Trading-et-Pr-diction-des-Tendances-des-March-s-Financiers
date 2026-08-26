"""
AlphaML Email Service — Service centralisé d'envoi d'emails.

Gère l'envoi d'emails transactionnels via SMTP.
Supporte Gmail (mot de passe d'application), Outlook, et tout serveur SMTP standard.
"""
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)


def _build_reset_email_html(reset_link: str, expires_minutes: int = 30) -> str:
    """Construit le corps HTML de l'email de réinitialisation."""
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Réinitialisation de mot de passe AlphaML</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#161b27;border:1px solid #2a3044;border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a,#3b82f6);padding:32px 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#3b82f6;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                    <span style="color:white;font-size:18px;">📈</span>
                  </td>
                  <td style="padding-left:12px;">
                    <div style="color:white;font-size:18px;font-weight:700;">AlphaML</div>
                    <div style="color:rgba(255,255,255,0.7);font-size:11px;">Predict Engine v3.2</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0 0 8px;">
                Réinitialisation de mot de passe
              </h1>
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 28px;">
                Vous avez demandé la réinitialisation de votre mot de passe AlphaML.<br>
                Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#3b82f6;border-radius:8px;">
                    <a href="{reset_link}" style="display:inline-block;padding:14px 28px;color:white;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Réinitialiser mon mot de passe →
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Link fallback -->
              <div style="background:#1e2740;border:1px solid #2a3044;border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="color:#64748b;font-size:11px;margin:0 0 6px;">Si le bouton ne fonctionne pas, copiez ce lien :</p>
                <p style="color:#3b82f6;font-size:11px;word-break:break-all;margin:0;">{reset_link}</p>
              </div>
              <!-- Expiry notice -->
              <div style="display:flex;align-items:center;gap:8px;background:#1a1f2e;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0;padding:12px 16px;margin-bottom:24px;">
                <span style="color:#f59e0b;font-size:13px;">⚠️</span>
                <p style="color:#94a3b8;font-size:12px;margin:0;">
                  Ce lien expire dans <strong style="color:#f1f5f9;">{expires_minutes} minutes</strong>.
                </p>
              </div>
              <!-- Security notice -->
              <p style="color:#475569;font-size:12px;line-height:1.5;margin:0;border-top:1px solid #2a3044;padding-top:20px;">
                🔒 Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité. 
                Votre mot de passe ne sera pas modifié.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#0f1117;padding:20px 40px;text-align:center;border-top:1px solid #2a3044;">
              <p style="color:#334155;font-size:11px;margin:0;">
                © 2025 AlphaML — Plateforme d'analyse financière avancée
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_reset_email_text(reset_link: str, expires_minutes: int = 30) -> str:
    """Construit le corps texte brut de l'email de réinitialisation."""
    return f"""AlphaML — Réinitialisation de mot de passe

Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe AlphaML.

Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :
{reset_link}

Ce lien expire dans {expires_minutes} minutes.

Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.

— L'équipe AlphaML
"""


def send_reset_password_email(
    email: str,
    raw_token: str,
    frontend_url: str,
    expires_minutes: int = 30
) -> bool:
    """
    Envoie l'email de réinitialisation de mot de passe.
    
    Args:
        email: Adresse email du destinataire
        raw_token: Token brut (non hashé) à inclure dans le lien
        frontend_url: URL de base du frontend
        expires_minutes: Durée de validité du token en minutes
    
    Returns:
        True si l'email a été envoyé, False sinon
    """
    settings = get_settings()
    reset_link = f"{frontend_url}/reset-password?token={raw_token}"

    # Mode développement: SMTP non configuré → log uniquement
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        logger.warning("SMTP non configuré — email non envoyé.")
        logger.info("DEV MODE — Lien de réinitialisation généré pour user=%s", email)
        # Log the reset link at INFO level so dev can use it. NOT logging the token itself.
        logger.info("DEV MODE — Pour tester, ouvrez : %s", reset_link)
        return False

    sender = settings.smtp_from or settings.smtp_username

    # Construire le message MIME multipart
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Réinitialisation de votre mot de passe AlphaML"
    msg["From"] = f"AlphaML <{sender}>"
    msg["To"] = email

    part_text = MIMEText(_build_reset_email_text(reset_link, expires_minutes), "plain", "utf-8")
    part_html = MIMEText(_build_reset_email_html(reset_link, expires_minutes), "html", "utf-8")

    # L'ordre est important : HTML en dernier pour priorité
    msg.attach(part_text)
    msg.attach(part_html)

    smtp_port = int(settings.smtp_port or 587)

    try:
        if smtp_port == 465:
            # SSL direct
            with smtplib.SMTP_SSL(settings.smtp_host, smtp_port) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
        else:
            # STARTTLS (port 587 standard Gmail/Outlook)
            with smtplib.SMTP(settings.smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)

        logger.info("Email de réinitialisation envoyé avec succès à user=%s", email)
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error(
            "Échec d'authentification SMTP. Vérifiez SMTP_USERNAME et SMTP_PASSWORD dans .env. "
            "Pour Gmail : utilisez un mot de passe d'application (pas votre mot de passe Gmail)."
        )
        return False
    except smtplib.SMTPConnectError as e:
        logger.error("Impossible de se connecter au serveur SMTP %s:%d — %s", settings.smtp_host, smtp_port, e)
        return False
    except smtplib.SMTPException as e:
        logger.error("Erreur SMTP lors de l'envoi à user=%s — %s", email, e)
        return False
    except Exception as e:
        logger.error("Erreur inattendue lors de l'envoi d'email — %s", e)
        return False


def _build_google_reminder_email_html(frontend_url: str) -> str:
    """Construit le corps HTML de l'email de rappel pour compte Google."""
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connexion à AlphaML</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#161b27;border:1px solid #2a3044;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a,#3b82f6);padding:32px 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#3b82f6;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                    <span style="color:white;font-size:18px;">📈</span>
                  </td>
                  <td style="padding-left:12px;">
                    <div style="color:white;font-size:18px;font-weight:700;">AlphaML</div>
                    <div style="color:rgba(255,255,255,0.7);font-size:11px;">Predict Engine v3.2</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="color:#f1f5f9;font-size:22px;font-weight:700;margin:0 0 8px;">
                Connexion à votre compte
              </h1>
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 28px;">
                Vous avez demandé la réinitialisation de votre mot de passe AlphaML, mais <strong>votre compte est associé à Google</strong>.<br><br>
                Vous n'avez pas de mot de passe classique. Pour accéder à votre compte, veuillez utiliser le bouton <strong>« Continuer avec Google »</strong> sur la page de connexion.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">
                    <a href="{frontend_url}" style="display:inline-block;padding:12px 24px;color:#1e293b;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Retourner à la connexion
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#0f1117;padding:20px 40px;text-align:center;border-top:1px solid #2a3044;">
              <p style="color:#334155;font-size:11px;margin:0;">
                © 2025 AlphaML — Plateforme d'analyse financière avancée
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_google_reminder_email_text(frontend_url: str) -> str:
    """Construit le corps texte brut de l'email de rappel pour compte Google."""
    return f"""AlphaML — Connexion à votre compte

Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe AlphaML, mais votre compte est associé à Google.

Vous n'avez pas de mot de passe classique. Pour accéder à votre compte, veuillez utiliser le bouton « Continuer avec Google » sur la page de connexion :
{frontend_url}

— L'équipe AlphaML
"""

def send_google_account_reminder_email(email: str, frontend_url: str) -> bool:
    """
    Envoie un email rappelant à l'utilisateur d'utiliser Google OAuth.
    """
    settings = get_settings()

    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        logger.warning("SMTP non configuré — email de rappel non envoyé.")
        return False

    sender = settings.smtp_from or settings.smtp_username

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Connexion à votre compte AlphaML"
    msg["From"] = f"AlphaML <{sender}>"
    msg["To"] = email

    part_text = MIMEText(_build_google_reminder_email_text(frontend_url), "plain", "utf-8")
    part_html = MIMEText(_build_google_reminder_email_html(frontend_url), "html", "utf-8")

    msg.attach(part_text)
    msg.attach(part_html)

    smtp_port = int(settings.smtp_port or 587)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, smtp_port) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(msg)

        logger.info("Email de rappel Google envoyé avec succès à user=%s", email)
        return True

    except Exception as e:
        logger.error("Erreur inattendue lors de l'envoi d'email de rappel Google — %s", e)
        return False


def test_smtp_connection() -> dict:
    """
    Teste la connexion SMTP sans envoyer d'email.
    Utile pour diagnostiquer la configuration.
    
    Returns:
        dict avec status, message, et détails
    """
    settings = get_settings()

    if not settings.smtp_host:
        return {"ok": False, "message": "SMTP_HOST manquant dans .env"}
    if not settings.smtp_username:
        return {"ok": False, "message": "SMTP_USERNAME manquant dans .env"}
    if not settings.smtp_password:
        return {"ok": False, "message": "SMTP_PASSWORD manquant dans .env"}

    smtp_port = int(settings.smtp_port or 587)

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, smtp_port) as server:
                server.login(settings.smtp_username, settings.smtp_password)
        else:
            with smtplib.SMTP(settings.smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(settings.smtp_username, settings.smtp_password)

        return {
            "ok": True,
            "message": f"Connexion SMTP réussie vers {settings.smtp_host}:{smtp_port}",
            "host": settings.smtp_host,
            "port": smtp_port,
            "from": settings.smtp_from or settings.smtp_username,
        }
    except smtplib.SMTPAuthenticationError:
        return {
            "ok": False,
            "message": "Authentification échouée. Pour Gmail: utilisez un mot de passe d'application.",
            "host": settings.smtp_host,
            "port": smtp_port,
        }
    except Exception as e:
        return {
            "ok": False,
            "message": f"Erreur: {type(e).__name__}",
            "host": settings.smtp_host,
            "port": smtp_port,
        }
