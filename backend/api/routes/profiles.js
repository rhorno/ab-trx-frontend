/**
 * Profiles Route Handler
 *
 * Handles profile listing endpoint using configuration service.
 */

/**
 * Handle profiles listing request
 * @param {Object} res - Express response object
 */
async function handleListProfiles(res) {
  try {
    // Dynamic import for ES module (TypeScript file)
    const configModule = await import("../../services/configuration/index.ts");
    const configService = configModule.configurationService;

    // Load all profiles
    const profiles = configService.loadAllProfiles();

    // Format response with profile details
    const profileList = Object.keys(profiles).map((profileName) => {
      const profile = profiles[profileName];
      return {
        name: profileName,
        bank: profile.bank,
        actualAccountId: profile.actualAccountId,
        bankParams: profile.bankParams,
      };
    });

    res.json({
      success: true,
      profiles: profileList,
      count: profileList.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}

export { handleListProfiles };
