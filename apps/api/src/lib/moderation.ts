// Automatic review flags (spec 6: "auto-flagged content (profanity, spam, suspected fake reviews)").
// A flagged review is held as `pending` for a moderator instead of being published.

const PROFANITY = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'motherfucker',
  'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'chutiye', 'gandu', 'harami', 'randi', 'bhosdi', 'lauda', 'lavda',
  'मादरचोद', 'बहनचोद', 'चूतिया', 'गांडू', 'हरामी', 'रंडी',
];
const profanityRe = new RegExp(`(^|[^\\p{L}])(${PROFANITY.join('|')})([^\\p{L}]|$)`, 'iu');

export function textFlags(text: string): string[] {
  const flags: string[] = [];
  if (profanityRe.test(text)) flags.push('profanity');
  if (/https?:\/\/|www\.|\.com\b|\.in\b/i.test(text)) flags.push('link');
  if (/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.test(text)) flags.push('phone_number');
  if (/(.)\1{7,}/u.test(text)) flags.push('repeated_characters');
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 30 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) flags.push('shouting');
  return flags;
}
