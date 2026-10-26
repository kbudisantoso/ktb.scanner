const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function releaseConfig(manifest, tag, prerelease) {
  if (manifest.name !== '@ktb-tools/scanner' || manifest.private !== false)
    throw new Error('Only the public @ktb-tools/scanner package may be released');
  const match = versionPattern.exec(manifest.version);
  if (!match || match[4]?.split('.').some((part) => /^0\d+$/.test(part)))
    throw new Error('Expected a semantic version without build metadata or leading zeroes');
  if (tag !== `v${manifest.version}`) throw new Error('Release tag must match the package version');
  const isPrerelease = Boolean(match[4]);
  if (prerelease !== undefined && prerelease !== isPrerelease)
    throw new Error('GitHub prerelease status must match the semantic version');
  if (
    manifest.publishConfig?.access !== 'public' ||
    manifest.publishConfig?.registry !== 'https://registry.npmjs.org/'
  )
    throw new Error('Release must target the public npm registry');
  return {
    version: manifest.version,
    npmTag: isPrerelease ? 'next' : 'latest',
    archive: `ktb-tools-scanner-${manifest.version}.tgz`,
  };
}

export function registryState(status, metadata, expectedIntegrity) {
  if (status === 404) return 'missing';
  if (status !== 200) throw new Error(`npm registry returned HTTP ${status}`);
  if (metadata?.dist?.integrity !== expectedIntegrity)
    throw new Error('This version already exists on npm with different package bytes');
  return 'identical';
}
