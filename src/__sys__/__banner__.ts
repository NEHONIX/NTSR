import pc from "picocolors";
import { __version__ } from "./__version";

// Cache for the banner to avoid recomputation
let cachedBanner: string;

// Lazy initialization function to build banner only when needed
function getBanner(): string {
  if (cachedBanner) return cachedBanner;

  // Build banner using picocolors for optimal performance
  const lines = [
    "",
    pc.cyan(
      "    ╭═══════════════════════════════════════════════════════════════════════╮"
    ),
    pc.cyan("  ╭═╯") +
      "                                                                     " +
      pc.cyan("╰═╮"),
    pc.cyan(" ╱") +
      "                                                                         " +
      pc.cyan("╲"),
    pc.cyan("╱") +
      "                                                                           " +
      pc.cyan("╲"),
    pc.cyan("│") +
      "  " +
      pc.yellow("⚡⚡⚡") +
      "                                                               " +
      pc.yellow("⚡⚡⚡") +
      "  " +
      pc.cyan("│"),
    pc.cyan("│") +
      "                                                                           " +
      pc.cyan("│"),
    pc.cyan("│") +
      "     " +
      pc.yellow("███╗   ██╗") +
      pc.yellow("████████╗") +
      pc.red("███████╗") +
      pc.magenta("██████╗") +
      "      " +
      pc.cyan("│"),
    pc.cyan("│") +
      "     " +
      pc.yellow("████╗  ██║") +
      pc.yellow("╚══██╔══╝") +
      pc.red("██╔════╝") +
      pc.magenta("██╔══██╗") +
      "     " +
      pc.cyan("│"),
    pc.cyan("│") +
      "     " +
      pc.yellow("██╔██╗ ██║") +
      pc.yellow("   ██║   ") +
      pc.red("███████╗") +
      pc.magenta("██████╔╝") +
      "     " +
      pc.cyan("│"),
    pc.cyan("│") +
      "     " +
      pc.yellow("██║╚██╗██║") +
      pc.yellow("   ██║   ") +
      pc.red("╚════██║") +
      pc.magenta("██╔══██╗") +
      "     " +
      pc.cyan("│"),
    pc.cyan("│") +
      "     " +
      pc.yellow("██║ ╚████║") +
      pc.yellow("   ██║   ") +
      pc.red("███████║") +
      pc.magenta("██║  ██║") +
      "     " +
      pc.cyan("│"),
    pc.cyan("│") +
      "     " +
      pc.yellow("╚═╝  ╚═══╝") +
      pc.yellow("   ╚═╝   ") +
      pc.red("╚══════╝") +
      pc.magenta("╚═╝  ╚═╝") +
      "     " +
      pc.cyan("│"),
    pc.cyan("│") +
      "                                                                           " +
      pc.cyan("│"),
    pc.cyan("│") +
      "           " +
      pc.bold(pc.magenta("Nehonix TypeScript Runner ")) +
      pc.magenta("v" + __version__) +
      "                  " +
      pc.cyan("│"),
    pc.cyan("│") +
      "       " +
      pc.blue("⚡ Lightning-fast TypeScript execution made simple ⚡") +
      "       " +
      pc.cyan("│"),
    pc.cyan("│") +
      "                                                                           " +
      pc.cyan("│"),
    pc.cyan("│") +
      "    " +
      pc.yellow("▓") +
      pc.yellow("▓") +
      pc.red("▓") +
      pc.magenta("▓") +
      pc.magenta("▓") +
      pc.blue("▓") +
      pc.blue("▓") +
      pc.cyan("▓") +
      pc.green("▓") +
      pc.yellow("▓") +
      pc.yellow("▓") +
      pc.red("▓") +
      pc.magenta("▓") +
      pc.magenta("▓") +
      pc.blue("▓") +
      pc.blue("▓") +
      pc.cyan("▓") +
      pc.green("▓") +
      pc.yellow("▓") +
      pc.yellow("▓") +
      pc.red("▓") +
      pc.magenta("▓") +
      pc.magenta("▓") +
      pc.blue("▓") +
      pc.blue("▓") +
      pc.cyan("▓") +
      pc.green("▓") +
      "    " +
      pc.cyan("│"),
    pc.cyan("│") +
      "                                                                           " +
      pc.cyan("│"),
    pc.cyan("│") +
      " " +
      pc.gray("Copyright © 2025 ") +
      pc.green("NEHONIX") +
      pc.gray(". Licensed under ") +
      pc.yellow("MIT License") +
      pc.gray(".") +
      "             " +
      pc.cyan("│"),
    pc.cyan("│") +
      " " +
      pc.blue("Part of the ") +
      pc.magenta("Fortify") +
      pc.blue(" ecosystem - optimized for speed and simplicity") +
      " " +
      pc.cyan("│"),
    pc.cyan("│") +
      "                                                                           " +
      pc.cyan("│"),
    pc.cyan("│") +
      "   " +
      pc.yellow("◆") +
      " " +
      pc.green("TypeScript Compiler API") +
      " " +
      pc.yellow("◆") +
      " " +
      pc.red("ESBuild Integration") +
      " " +
      pc.yellow("◆") +
      " " +
      pc.magenta("Enhanced Output") +
      " " +
      pc.yellow("◆") +
      "   " +
      pc.cyan("│"),
    pc.cyan("╲") +
      "                                                                           " +
      pc.cyan("╱"),
    pc.cyan(" ╲") +
      "                                                                         " +
      pc.cyan("╱"),
    pc.cyan("  ╰═╮") +
      "                                                                     " +
      pc.cyan("╭═╯"),
    pc.cyan(
      "    ╰═══════════════════════════════════════════════════════════════════════╯"
    ),
    "",
    pc.yellow("                    ● ") +
      pc.yellow("● ") +
      pc.red("● ") +
      pc.magenta("Ready to execute TypeScript") +
      pc.red(" ● ") +
      pc.yellow("● ") +
      pc.yellow("●"),
    "",
  ];

  cachedBanner = lines.join("\n");
  return cachedBanner;
}

// Export the getter function
export { getBanner as __banner__ };
