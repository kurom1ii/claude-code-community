/**
 * Claude Code Community - Version Comparator
 * Semantic version parsing and comparison utilities
 */

import type { SemVer, VersionDiff } from './types';

// ============================================================================
// Version Parsing
// ============================================================================

/**
 * Regular expression for parsing semantic versions
 * Supports: major.minor.patch[-prerelease][+build]
 * Examples: 2.1.30, 2.1.30-beta.1, 2.1.30+20250205
 */
const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;

/**
 * Parse a version string into SemVer components
 *
 * @param version - Version string to parse
 * @returns Parsed SemVer object
 * @throws Error if version string is invalid
 *
 * @example
 * ```typescript
 * parseVersion('2.1.30');
 * // { major: 2, minor: 1, patch: 30, raw: '2.1.30' }
 *
 * parseVersion('2.1.30-beta.1+20250205');
 * // { major: 2, minor: 1, patch: 30, prerelease: 'beta.1', build: '20250205', raw: '2.1.30-beta.1+20250205' }
 * ```
 */
export function parseVersion(version: string): SemVer {
  const match = version.trim().match(SEMVER_REGEX);

  if (!match) {
    throw new Error(`Invalid version string: "${version}"`);
  }

  const [, major, minor, patch, prerelease, build] = match;

  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease || undefined,
    build: build || undefined,
    raw: version.trim().replace(/^v/, ''),
  };
}

/**
 * Try to parse a version string, returning null if invalid
 *
 * @param version - Version string to parse
 * @returns Parsed SemVer object or null
 */
export function tryParseVersion(version: string): SemVer | null {
  try {
    return parseVersion(version);
  } catch {
    return null;
  }
}

/**
 * Check if a string is a valid semantic version
 *
 * @param version - Version string to validate
 * @returns true if valid
 */
export function isValidVersion(version: string): boolean {
  return SEMVER_REGEX.test(version.trim());
}

// ============================================================================
// Pre-release Comparison
// ============================================================================

/**
 * Compare pre-release identifiers
 * Rules:
 * - Numeric identifiers are compared as integers
 * - Alphanumeric identifiers are compared lexically
 * - Numeric identifiers always have lower precedence
 * - A version without pre-release has higher precedence
 *
 * @param a - First pre-release string
 * @param b - Second pre-release string
 * @returns -1 if a < b, 0 if a = b, 1 if a > b
 */
function comparePrereleases(a: string | undefined, b: string | undefined): number {
  // No pre-release > has pre-release
  if (!a && !b) return 0;
  if (!a && b) return 1;  // Stable release > pre-release
  if (a && !b) return -1; // Pre-release < stable release

  const partsA = a!.split('.');
  const partsB = b!.split('.');

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i];
    const partB = partsB[i];

    // Fewer parts = lower precedence
    if (partA === undefined && partB !== undefined) return -1;
    if (partA !== undefined && partB === undefined) return 1;

    const numA = parseInt(partA, 10);
    const numB = parseInt(partB, 10);
    const isNumA = !isNaN(numA);
    const isNumB = !isNaN(numB);

    // Numeric < alphanumeric
    if (isNumA && !isNumB) return -1;
    if (!isNumA && isNumB) return 1;

    // Both numeric
    if (isNumA && isNumB) {
      if (numA < numB) return -1;
      if (numA > numB) return 1;
      continue;
    }

    // Both alphanumeric
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }

  return 0;
}

// ============================================================================
// Version Comparison
// ============================================================================

/**
 * Compare two semantic versions
 *
 * @param a - First version string or SemVer
 * @param b - Second version string or SemVer
 * @returns -1 if a < b, 0 if a = b, 1 if a > b
 *
 * @example
 * ```typescript
 * compare('2.1.30', '2.1.31'); // -1
 * compare('2.2.0', '2.1.99');  // 1
 * compare('2.1.30', '2.1.30'); // 0
 * ```
 */
export function compare(a: string | SemVer, b: string | SemVer): number {
  const verA = typeof a === 'string' ? parseVersion(a) : a;
  const verB = typeof b === 'string' ? parseVersion(b) : b;

  // Compare major
  if (verA.major < verB.major) return -1;
  if (verA.major > verB.major) return 1;

  // Compare minor
  if (verA.minor < verB.minor) return -1;
  if (verA.minor > verB.minor) return 1;

  // Compare patch
  if (verA.patch < verB.patch) return -1;
  if (verA.patch > verB.patch) return 1;

  // Compare pre-release
  return comparePrereleases(verA.prerelease, verB.prerelease);
}

/**
 * Check if latest version is newer than current
 *
 * @param current - Current version
 * @param latest - Latest version to compare against
 * @returns true if latest is newer than current
 *
 * @example
 * ```typescript
 * isNewer('2.1.30', '2.1.31'); // true
 * isNewer('2.1.30', '2.1.30'); // false
 * isNewer('2.1.31', '2.1.30'); // false
 * ```
 */
export function isNewer(current: string | SemVer, latest: string | SemVer): boolean {
  return compare(current, latest) < 0;
}

/**
 * Check if two versions are equal (ignoring build metadata)
 *
 * @param a - First version
 * @param b - Second version
 * @returns true if versions are equal
 */
export function isEqual(a: string | SemVer, b: string | SemVer): boolean {
  return compare(a, b) === 0;
}

/**
 * Check if version a is greater than or equal to version b
 */
export function gte(a: string | SemVer, b: string | SemVer): boolean {
  return compare(a, b) >= 0;
}

/**
 * Check if version a is less than or equal to version b
 */
export function lte(a: string | SemVer, b: string | SemVer): boolean {
  return compare(a, b) <= 0;
}

// ============================================================================
// Version Difference
// ============================================================================

/**
 * Get the type of difference between two versions
 *
 * @param from - Starting version
 * @param to - Target version
 * @returns Type of version difference
 *
 * @example
 * ```typescript
 * getVersionDiff('2.1.30', '3.0.0');  // 'major'
 * getVersionDiff('2.1.30', '2.2.0');  // 'minor'
 * getVersionDiff('2.1.30', '2.1.31'); // 'patch'
 * ```
 */
export function getVersionDiff(from: string | SemVer, to: string | SemVer): VersionDiff {
  const verFrom = typeof from === 'string' ? parseVersion(from) : from;
  const verTo = typeof to === 'string' ? parseVersion(to) : to;

  if (verFrom.major !== verTo.major) {
    return 'major';
  }

  if (verFrom.minor !== verTo.minor) {
    return 'minor';
  }

  if (verFrom.patch !== verTo.patch) {
    return 'patch';
  }

  if (verFrom.prerelease !== verTo.prerelease) {
    return 'prerelease';
  }

  if (verFrom.build !== verTo.build) {
    return 'build';
  }

  return 'none';
}

// ============================================================================
// Version Utilities
// ============================================================================

/**
 * Format a SemVer object back to a version string
 *
 * @param version - SemVer object to format
 * @param includePrefix - Whether to include 'v' prefix
 * @returns Formatted version string
 */
export function formatVersion(version: SemVer, includePrefix = false): string {
  let result = `${version.major}.${version.minor}.${version.patch}`;

  if (version.prerelease) {
    result += `-${version.prerelease}`;
  }

  if (version.build) {
    result += `+${version.build}`;
  }

  return includePrefix ? `v${result}` : result;
}

/**
 * Increment a version by the specified type
 *
 * @param version - Version to increment
 * @param type - Type of increment ('major', 'minor', 'patch')
 * @returns New version string
 */
export function incrementVersion(
  version: string | SemVer,
  type: 'major' | 'minor' | 'patch'
): string {
  const ver = typeof version === 'string' ? parseVersion(version) : { ...version };

  switch (type) {
    case 'major':
      ver.major++;
      ver.minor = 0;
      ver.patch = 0;
      ver.prerelease = undefined;
      break;
    case 'minor':
      ver.minor++;
      ver.patch = 0;
      ver.prerelease = undefined;
      break;
    case 'patch':
      ver.patch++;
      ver.prerelease = undefined;
      break;
  }

  return formatVersion(ver);
}

/**
 * Sort an array of versions in ascending or descending order
 *
 * @param versions - Array of version strings
 * @param descending - Sort in descending order (newest first)
 * @returns Sorted array of versions
 */
export function sortVersions(versions: string[], descending = false): string[] {
  return [...versions].sort((a, b) => {
    const result = compare(a, b);
    return descending ? -result : result;
  });
}

/**
 * Get the latest version from an array of versions
 *
 * @param versions - Array of version strings
 * @returns Latest version or null if array is empty
 */
export function getLatestVersion(versions: string[]): string | null {
  if (versions.length === 0) return null;
  return sortVersions(versions, true)[0];
}

/**
 * Filter versions to only include stable releases (no pre-release)
 *
 * @param versions - Array of version strings
 * @returns Array of stable versions
 */
export function getStableVersions(versions: string[]): string[] {
  return versions.filter((v) => {
    const parsed = tryParseVersion(v);
    return parsed && !parsed.prerelease;
  });
}

/**
 * Check if a version satisfies a simple version range
 * Supports: exact version, ^major.minor.patch, ~major.minor.patch
 *
 * @param version - Version to check
 * @param range - Version range
 * @returns true if version satisfies range
 */
export function satisfiesRange(version: string, range: string): boolean {
  const ver = parseVersion(version);

  // Exact match
  if (!range.startsWith('^') && !range.startsWith('~')) {
    return isEqual(version, range);
  }

  const rangeVer = parseVersion(range.slice(1));

  // ^ - Compatible with (same major, >= specified)
  if (range.startsWith('^')) {
    return ver.major === rangeVer.major && gte(ver, rangeVer);
  }

  // ~ - Approximately equivalent (same major.minor, >= specified)
  if (range.startsWith('~')) {
    return (
      ver.major === rangeVer.major &&
      ver.minor === rangeVer.minor &&
      gte(ver, rangeVer)
    );
  }

  return false;
}

// ============================================================================
// VersionComparator Class (Object-oriented interface)
// ============================================================================

/**
 * Version comparator with caching for frequently compared versions
 */
export class VersionComparator {
  private cache = new Map<string, SemVer>();

  /**
   * Parse a version with caching
   */
  parse(version: string): SemVer {
    let parsed = this.cache.get(version);
    if (!parsed) {
      parsed = parseVersion(version);
      this.cache.set(version, parsed);
    }
    return parsed;
  }

  /**
   * Compare two versions
   */
  compare(a: string, b: string): number {
    return compare(this.parse(a), this.parse(b));
  }

  /**
   * Check if latest is newer than current
   */
  isNewer(current: string, latest: string): boolean {
    return isNewer(this.parse(current), this.parse(latest));
  }

  /**
   * Get version difference type
   */
  getVersionDiff(from: string, to: string): VersionDiff {
    return getVersionDiff(this.parse(from), this.parse(to));
  }

  /**
   * Clear the parse cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Default instance for simple usage
export const versionComparator = new VersionComparator();
