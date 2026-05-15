import "@/lib/config/load-cli-env";

import { bootstrapAdminRole } from "@/lib/auth/bootstrap-admin";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await bootstrapAdminRole(options);

  console.log(`Admin bootstrap mode: ${result.mode}`);
  console.log(`Supabase public config configured: ${result.supabaseConfigured}`);
  console.log(`Service role configured: ${result.serviceRoleConfigured}`);
  console.log(`Writes enabled: ${result.writesEnabled}`);
  console.log(`Write ready: ${result.writeReady}`);
  console.log(`Admin email configured: ${result.adminEmailConfigured}`);
  console.log(`Auth lookup attempted: ${result.authLookupAttempted}`);
  console.log(`Auth users scanned: ${result.userRowsScanned}`);
  console.log(`Matching auth user found: ${result.authUserFound}`);
  console.log(`Existing profile found: ${result.existingProfileFound}`);
  console.log(`Existing admin role found: ${result.existingAdminRoleFound}`);
  console.log(`Profile rows affected or planned: ${result.profileRowsAffected}`);
  console.log(`Role rows affected or planned: ${result.roleRowsAffected}`);

  if (!result.adminEmailConfigured) {
    console.log("ADMIN_EMAIL is required before bootstrap can locate an auth user.");
  }

  if (!result.authUserFound && result.authLookupAttempted) {
    console.log("Admin auth user was not found. The admin must sign in once first, then rerun bootstrap.");
  }

  if (result.mode === "dry-run") {
    console.log("Dry run only. No Supabase writes were attempted.");
  }
}

function parseArgs(args: string[]) {
  const options = {
    write: false
  };

  for (const arg of args) {
    switch (arg) {
      case "--write":
        options.write = true;
        break;
      case "--dry-run":
        options.write = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Admin bootstrap failed.";
  console.error(message);
  process.exit(1);
});
