import { registerPlugin } from '@capacitor/core';

const DriveAuth = registerPlugin('DriveAuth');

export const nativeDriveAuthorize = async (scopes = []) => DriveAuth.authorize({ scopes });

export const nativeDriveDisconnect = async (accessToken = '') => DriveAuth.disconnect({ accessToken });

export const nativeDrivePing = async () => {
  if (!DriveAuth?.ping) return { available: false };
  return DriveAuth.ping();
};
