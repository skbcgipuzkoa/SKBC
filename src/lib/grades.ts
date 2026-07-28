export const adultGrades = [
  "MINARAI",
  "5 KYU",
  "4 KYU",
  "3 KYU",
  "2 KYU",
  "1 KYU",
  "1 DAN",
  "2 DAN",
  "3 DAN",
  "4 DAN",
  "5 DAN",
  "6 DAN",
  "7 DAN",
  "8 DAN",
  "9 DAN",
  "10 DAN"
];

export const kidsGrades = [
  "BLANCO",
  "BLANCO-AMARILLO",
  "AMARILLO",
  "AMARILLO-NARANJA",
  "NARANJA",
  "NARANJA-VERDE",
  "VERDE",
  "VERDE-AZUL",
  "AZUL",
  "AZUL-MARRON",
  "MARRON",
  "5 KYU",
  "4 KYU",
  "3 KYU",
  "2 KYU",
  "1 KYU"
];

export const allGrades = [...new Set([...kidsGrades, ...adultGrades])];
