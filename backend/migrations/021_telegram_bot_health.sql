-- Bot polling holati: worker har getUpdates natijasini yozadi. "Conflict: terminated by other getUpdates request" —
-- shu token bilan boshqa joyda ham worker ishlayapti; diagnostika va profil shuni ko'rsatadi (2026-10-13 topilmasi).
ALTER TABLE telegram_bot_state
 ADD COLUMN last_ok_at timestamptz,
 ADD COLUMN last_error text,
 ADD COLUMN last_error_at timestamptz;
