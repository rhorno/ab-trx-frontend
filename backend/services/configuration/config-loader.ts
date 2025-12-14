/**
 * Configuration Service
 * Profile-based configuration system with global settings from .env
 *
 * This service manages all configuration including environment variables,
 * profiles, and application settings.
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
dotenv.config({ quiet: true });

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface UserConfig {
  user: string;
  bank: {
    name: string;
    deduplication?: {
      enabled: boolean;
      overlapDays: number;
    };
    [key: string]: any; // Dynamic properties per bank integration
  };
  actualBudget: {
    serverUrl: string;
    password?: string;
    syncId: string;
    accountId: string;
    encryptionKey?: string;
  };
}

export interface Profile {
  bank: string;
  bankParams: Record<string, any>;
  actualAccountId: string;
}

export interface ProfileCollection {
  [profileName: string]: Profile;
}

// Bank registry will be imported from bank-integration service
// For now, we'll define a minimal interface to avoid circular dependencies
interface BankDefinition {
  name: string;
}

// Temporary: Will be replaced when bank registry is migrated
// This allows the config service to work independently
let bankRegistry: BankDefinition[] = [];

/**
 * Set bank registry (called after bank registry is migrated)
 */
export function setBankRegistry(banks: BankDefinition[]): void {
  bankRegistry = banks;
}

/**
 * Load profiles from profiles.json
 */
export function loadProfiles(): ProfileCollection {
  // Try multiple possible locations for profiles.json
  const possiblePaths = [
    path.join(__dirname, "profiles.json"), // Same directory as this file
    path.join(
      process.cwd(),
      "backend",
      "services",
      "configuration",
      "profiles.json"
    ), // From project root
    path.join(process.cwd(), "services", "configuration", "profiles.json"), // Alternative path
  ];

  let profilesPath: string | null = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      profilesPath = testPath;
      break;
    }
  }

  if (!profilesPath) {
    throw new Error(
      "Configuration file not found: profiles.json\n" +
        "Please ensure profiles.json exists in the configuration service directory."
    );
  }

  try {
    const content = fs.readFileSync(profilesPath, "utf-8");
    const profiles = JSON.parse(content);

    if (
      typeof profiles !== "object" ||
      profiles === null ||
      Array.isArray(profiles)
    ) {
      throw new Error(
        "profiles.json must contain a JSON object with profile definitions"
      );
    }

    return profiles;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse profiles.json: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get a specific profile by name
 */
export function getProfile(profileName: string): Profile {
  const profiles = loadProfiles();

  if (!(profileName in profiles)) {
    const availableProfiles = Object.keys(profiles);
    throw new Error(
      `Profile '${profileName}' not found. Available profiles: ${availableProfiles.join(
        ", "
      )}`
    );
  }

  const profile = profiles[profileName];
  validateProfile(profile, profileName);

  return profile;
}

/**
 * Validate that a profile has all required fields
 */
export function validateProfile(
  profile: any,
  profileName: string
): asserts profile is Profile {
  const requiredFields = ["bank", "bankParams", "actualAccountId"];

  for (const field of requiredFields) {
    if (
      !(field in profile) ||
      profile[field] === undefined ||
      profile[field] === null
    ) {
      throw new Error(
        `Profile '${profileName}' is missing required field: ${field}`
      );
    }
  }

  // Validate actualAccountId is a string (UUID format check)
  if (
    typeof profile.actualAccountId !== "string" ||
    profile.actualAccountId.trim() === ""
  ) {
    throw new Error(
      `Profile '${profileName}' has invalid actualAccountId. Expected non-empty string.`
    );
  }

  // Validate UUID format (basic check)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(profile.actualAccountId)) {
    throw new Error(
      `Profile '${profileName}' has invalid actualAccountId format. Expected UUID format.`
    );
  }

  // Validate bank is a non-empty string
  if (typeof profile.bank !== "string" || profile.bank.trim() === "") {
    throw new Error(
      `Profile '${profileName}' has invalid bank name. Expected non-empty string.`
    );
  }

  // Validate bank exists in registry (if registry is set)
  if (bankRegistry.length > 0) {
    const bankExists = bankRegistry.some((b) => b.name === profile.bank);
    if (!bankExists) {
      const availableBanks = bankRegistry.map((b) => b.name).join(", ");
      throw new Error(
        `Profile '${profileName}' specifies unknown bank: '${profile.bank}'. ` +
          `Available banks: ${availableBanks}`
      );
    }
  }

  // Validate bankParams is an object
  if (
    typeof profile.bankParams !== "object" ||
    profile.bankParams === null ||
    Array.isArray(profile.bankParams)
  ) {
    throw new Error(
      `Profile '${profileName}' has invalid bankParams. Expected object.`
    );
  }
}

/**
 * Build complete configuration from global .env and profile
 */
export function buildConfig(profileName: string): UserConfig {
  // Load global configuration from .env
  const serverUrl = process.env.ACTUAL_SERVER_URL;
  const password = process.env.ACTUAL_PASSWORD;
  const syncId = process.env.ACTUAL_SYNC_ID;
  const encryptionKey = process.env.ACTUAL_ENCRYPTION_KEY;

  // Validate required global settings
  if (!serverUrl || !password || !syncId) {
    throw new Error(
      "Missing required Actual Budget configuration in .env file.\n" +
        "Required variables: ACTUAL_SERVER_URL, ACTUAL_PASSWORD, ACTUAL_SYNC_ID\n" +
        "Please ensure your .env file is configured correctly."
    );
  }

  // Load and validate profile
  const profile = getProfile(profileName);

  // Build complete configuration
  const config: UserConfig = {
    user: profileName, // Use profile name as user identifier
    bank: {
      name: profile.bank,
      ...profile.bankParams,
    },
    actualBudget: {
      serverUrl,
      password,
      syncId,
      accountId: profile.actualAccountId,
      encryptionKey: encryptionKey || undefined,
    },
  };

  return config;
}

/**
 * Get global Actual Budget configuration (for commands that don't need profiles)
 */
export function getGlobalConfig(): Pick<UserConfig, "actualBudget"> {
  const serverUrl = process.env.ACTUAL_SERVER_URL;
  const password = process.env.ACTUAL_PASSWORD;
  const syncId = process.env.ACTUAL_SYNC_ID;
  const encryptionKey = process.env.ACTUAL_ENCRYPTION_KEY;

  if (!serverUrl || !password || !syncId) {
    throw new Error(
      "Missing required Actual Budget configuration in .env file.\n" +
        "Required variables: ACTUAL_SERVER_URL, ACTUAL_PASSWORD, ACTUAL_SYNC_ID\n" +
        "Please configure your .env file to connect to Actual Budget."
    );
  }

  return {
    actualBudget: {
      serverUrl,
      password,
      syncId,
      accountId: "", // Not needed for global operations
      encryptionKey: encryptionKey || undefined,
    },
  };
}
