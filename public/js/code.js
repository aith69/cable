export const CODE_LENGTH = 6;

/** Solo le cifre, al massimo CODE_LENGTH. */
export const digitsOf = (text) => String(text ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);

/** 123456 diventa "123 - 456". Con meno di 4 cifre non aggiunge il separatore. */
export function formatCode(value) {
  const digits = digitsOf(value);
  return digits.length > 3 ? `${digits.slice(0, 3)} - ${digits.slice(3)}` : digits;
}
