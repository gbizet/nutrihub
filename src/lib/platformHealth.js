import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  HEALTH_PROVIDER,
  HEALTH_STREAMS,
  normalizeKnownHealthPermissions,
} from './healthSchema.js';

const HealthBridge = registerPlugin('HealthBridge');

export const defaultHealthPlatformStatus = () => {
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();
  const isAndroid = platform === 'android';

  return {
    platform,
    isNative,
    isAndroid,
    provider: HEALTH_PROVIDER.healthConnect,
    healthConnectAvailable: false,
    samsungHealthAvailable: false,
    samsungDataSdkBundled: false,
    samsungDataSdkGrantedPermissions: [],
    samsungDataSdkMissingPermissions: [],
    samsungDataSdkFallbackAvailable: false,
    samsungBodyCompositionFallbackAvailable: false,
    samsungDataSdkRequiresDeveloperMode: false,
    samsungReadDataRuntimeError: '',
    samsungLastError: '',
    samsungWeightFallbackReason: isAndroid
      ? 'Fallback Samsung direct non bundle.'
      : 'Fallback Samsung direct disponible uniquement sur Android.',
    grantedPermissions: [],
    missingPermissions: HEALTH_STREAMS.map((stream) => stream.id),
    reason: isAndroid
      ? 'Bridge Health Connect Android non branche.'
      : 'Import sante disponible uniquement sur Android.',
    supportedStreams: HEALTH_STREAMS,
  };
};

const normalizeStatus = (payload = {}) => ({
  ...(() => {
    const granted = normalizeKnownHealthPermissions(payload.grantedPermissions);
    const missing = normalizeKnownHealthPermissions(payload.missingPermissions);
    const samsungGranted = normalizeKnownHealthPermissions(payload.samsungDataSdkGrantedPermissions);
    const samsungMissing = normalizeKnownHealthPermissions(payload.samsungDataSdkMissingPermissions);
    return {
      ...defaultHealthPlatformStatus(),
      ...payload,
      provider: payload.provider || HEALTH_PROVIDER.healthConnect,
      supportedStreams: Array.isArray(payload.supportedStreams) && payload.supportedStreams.length
        ? payload.supportedStreams
        : HEALTH_STREAMS,
      grantedPermissions: granted.known,
      missingPermissions: missing.known,
      samsungDataSdkGrantedPermissions: samsungGranted.known,
      samsungDataSdkMissingPermissions: samsungMissing.known,
      unknownPermissions: [
        ...granted.unknown,
        ...missing.unknown,
        ...samsungGranted.unknown,
        ...samsungMissing.unknown,
      ],
      samsungReadDataRuntimeError: `${payload.samsungReadDataRuntimeError || ''}`.trim(),
      samsungLastError: `${payload.samsungLastError || ''}`.trim(),
    };
  })(),
});

const normalizeImportPayload = (payload = {}) => {
  const permissions = normalizeKnownHealthPermissions(payload.permissions);
  return {
    ...payload,
    permissions: permissions.known,
    validationWarnings: [
      ...((Array.isArray(payload.validationWarnings) ? payload.validationWarnings : [])),
      ...permissions.unknown.map((permission) => ({
        code: 'UNKNOWN_HEALTH_PERMISSION',
        message: `Permission sante inconnue ignoree: ${permission}`,
        permission,
      })),
    ],
  };
};

export const getHealthPlatformStatus = async () => {
  const fallback = defaultHealthPlatformStatus();
  if (!fallback.isAndroid || !fallback.isNative) return fallback;

  try {
    const status = await HealthBridge.getStatus();
    return normalizeStatus(status);
  } catch (error) {
    return {
      ...fallback,
      reason: error?.message || fallback.reason,
    };
  }
};

export const requestHealthImportPermissions = async () => {
  const status = await getHealthPlatformStatus();
  if (!status.isAndroid || !status.isNative) throw new Error(status.reason);
  return normalizeStatus(await HealthBridge.requestImportPermissions());
};

export const importHealthSnapshot = async ({ startDate, endDate } = {}) => {
  const status = await getHealthPlatformStatus();
  if (!status.isAndroid || !status.isNative) throw new Error(status.reason);
  return normalizeImportPayload(await HealthBridge.importSnapshot({
    startDate,
    endDate,
  }));
};
