// One-time activation for the owner-requested movie-inspired local voice.
// Run as one transaction so future user changes are never overwritten.
export const jarvisVoiceMigration = [
  `INSERT OR IGNORE INTO app_settings(key,value) VALUES('voice_v2', '{"provider":"browser","endpoint":"http://localhost:7860/v1/audio/speech","voice":"","speed":1,"pitch":1,"volume":0.8,"autoSpeak":false,"browserRecognition":false}')`,
  `UPDATE app_settings SET value=json_set(value,
    '$.provider','piper', '$.endpoint','http://127.0.0.1:7861/v1/audio/speech',
    '$.voice','jarvis-high', '$.autoSpeak',json('true')), updated_at=CURRENT_TIMESTAMP
    WHERE key='voice_v2' AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key='jarvis_voice_installed_v1')`,
  `INSERT INTO audit_log(actor,action,target_type,target_id,detail)
    SELECT 'owner','voice.install','setting','voice_v2','{"provider":"piper","voice":"jarvis-high","local":true}'
    WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key='jarvis_voice_installed_v1')`,
  `INSERT OR IGNORE INTO app_settings(key,value) VALUES('jarvis_voice_installed_v1','1')`,
];
