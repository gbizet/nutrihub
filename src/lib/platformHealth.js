import { Capacitor, registerPlugin } from '@capacitor/core';
import { HEALTH_PROVIDER, HEALTH_STREAMS } from './healthSchema.js';

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
  ...defaultHealthPlatformStatus(),
  ...payload,
  provider: payload.provider || HEALTH_PROVIDER.healthConnect,
  supportedStreams: Array.isArray(payload.supportedStreams) && payload.supportedStreams.length
    ? payload.supportedStreams
    : HEALTH_STREAMS,
  grantedPermissions: Array.isArray(payload.grantedPermissions) ? payload.grantedPermissions : [],
  missingPermissions: Array.isArray(payload.missingPermissions) ? payload.missingPermissions : [],
  samsungDataSdkGrantedPermissions: Array.isArray(payload.samsungDataSdkGrantedPermissions)
    ? payload.samsungDataSdkGrantedPermissions
    : [],
  samsungDataSdkMissingPermissions: Array.isArray(payload.samsungDataSdkMissingPermissions)
    ? payload.samsungDataSdkMissingPermissions
    : [],
  samsungReadDataRuntimeError: `${payload.samsungReadDataRuntimeError || ''}`.trim(),
  samsungLastError: `${payload.samsungLastError || ''}`.trim(),
});

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
  return HealthBridge.importSnapshot({
    startDate,
    endDate,
  });
};
