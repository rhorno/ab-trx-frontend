/**
 * Configuration Service
 * Entry point for configuration service
 *
 * This service manages all configuration including environment variables,
 * profiles, and application settings.
 */

import {
  loadProfiles,
  getProfile,
  buildConfig,
  getGlobalConfig,
  setBankRegistry,
  UserConfig,
  Profile,
  ProfileCollection,
} from "./config-loader.js";
import type { ConfigurationService as IConfigurationService } from "../shared/interfaces.js";

/**
 * Configuration Service Implementation
 */
export class ConfigurationService implements IConfigurationService {
  /**
   * Initialize the configuration service
   * @param bankRegistry - Bank registry for validation (optional, can be set later)
   */
  initialize(bankRegistry?: Array<{ name: string }>): void {
    if (bankRegistry) {
      setBankRegistry(bankRegistry);
    }
  }

  /**
   * Load all profiles
   */
  loadAllProfiles(): ProfileCollection {
    return loadProfiles();
  }

  /**
   * Load a specific profile by name
   */
  loadProfile(profileName: string): Profile {
    return getProfile(profileName);
  }

  /**
   * Build complete configuration from profile name
   */
  buildConfig(profileName: string): UserConfig {
    return buildConfig(profileName);
  }

  /**
   * Get global Actual Budget configuration
   */
  getGlobalConfig(): Pick<UserConfig, "actualBudget"> {
    return getGlobalConfig();
  }
}

// Export singleton instance
export const configurationService = new ConfigurationService();

// Export types
export type { UserConfig, Profile, ProfileCollection };
