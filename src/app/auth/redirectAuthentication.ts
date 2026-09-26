import type { IPublicClientApplication } from "@azure/msal-browser";
import {
  getAuthenticationErrorCode,
  getAuthenticationErrorMessage
} from "../../../shared/auth-redirect-contract.mjs";
import {
  readStorageItem,
  removeStorageItem,
  writeStorageItem
} from "../../shared/storage/browserStorage";

const AUTH_REDIRECT_ERROR_KEY = "alamo-platform-auth-redirect-error";
const AUTH_REDIRECT_ERROR_STORAGE = {
  kind: "session" as const,
  label: "Microsoft sign-in callback error"
};

function formatRedirectError(error: unknown) {
  const message = getAuthenticationErrorMessage(error);
  const code = getAuthenticationErrorCode(error);
  return code ? `${message} Microsoft error: ${code}.` : message;
}

function selectActiveAccount(instance: IPublicClientApplication) {
  if (instance.getActiveAccount()) return;

  const accounts = instance.getAllAccounts();
  if (accounts.length === 1) {
    instance.setActiveAccount(accounts[0] ?? null);
  }
}

export async function initializeRedirectAuthentication(instance: IPublicClientApplication) {
  await instance.initialize();

  try {
    const result = await instance.handleRedirectPromise();
    if (result?.account) {
      instance.setActiveAccount(result.account);
      clearRedirectAuthenticationError();
    }
  } catch (error) {
    const message = formatRedirectError(error);
    writeStorageItem(AUTH_REDIRECT_ERROR_KEY, message, AUTH_REDIRECT_ERROR_STORAGE);
    console.error("Microsoft Entra redirect callback failed.", error);
  }

  selectActiveAccount(instance);
}

export function readRedirectAuthenticationError() {
  return readStorageItem(AUTH_REDIRECT_ERROR_KEY, AUTH_REDIRECT_ERROR_STORAGE);
}

export function clearRedirectAuthenticationError() {
  removeStorageItem(AUTH_REDIRECT_ERROR_KEY, AUTH_REDIRECT_ERROR_STORAGE);
}
