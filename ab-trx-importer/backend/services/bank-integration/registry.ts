export interface BankDefinition {
  name: string;
  entry: string; // relative path to the module (for dynamic import)
}

export const banks: BankDefinition[] = [
  { name: 'handelsbanken', entry: `./banks/handelsbanken/index.js` },
  // Add more banks here as needed
];