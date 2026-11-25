/**
 * Utilidades para neutralización de inyección de fórmulas en exportaciones CSV (H-22).
 */

/**
 * Expresión regular para detectar si una cadena de texto, obviando espacios iniciales
 * (excepto tabuladores y retornos de carro que son en sí mismos caracteres detonantes),
 * comienza con caracteres especiales interpretables como fórmulas por hojas de cálculo
 * como Microsoft Excel, LibreOffice Calc o Google Sheets:
 * - '=' (inicia fórmula directa)
 * - '+' (operador de inicio de fórmula en Excel)
 * - '-' (operador de inicio de fórmula en Excel)
 * - '@' (inicio de funciones implícitas en Excel / Lotus)
 * - '\t' (tabulador horizontal, vector de ejecución / delimitador)
 * - '\r' (retorno de carro, vector de inyección de delimitadores)
 */
const CSV_FORMULA_REGEX = /^[^\S\r\t]*[=+\-@\t\r]/;

/**
 * Neutraliza posibles inyecciones de fórmulas (CSV / Formula Injection) en valores de texto libre.
 *
 * Si el texto (sin contar espacios iniciales) empieza con '=', '+', '-', '@', tabulador ('\t')
 * o retorno de carro ('\r'), devuelve el texto con un apóstrofo (') antepuesto para forzar su
 * interpretación estricta como texto plano al abrirse en hojas de cálculo. Si no, lo devuelve igual.
 *
 * Tolera valores nulos o indefinidos devolviendo una cadena vacía.
 *
 * @param value Cadena de texto a sanitizar.
 * @returns Cadena neutralizada con apóstrofo antepuesto si corresponde, o el valor original.
 */
export function neutralizeCsvFormula(value?: string | null): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    return '';
  }
  if (value.length === 0) {
    return '';
  }
  if (CSV_FORMULA_REGEX.test(value)) {
    return `'${value}`;
  }
  return value;
}
