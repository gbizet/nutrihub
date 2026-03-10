package com.guibizet.nutrisporthub;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "DriveAuth")
public class DriveAuthPlugin extends Plugin {

    private static final String EXTRA_PENDING_INTENT = "driveAuthPendingIntent";

    @PluginMethod
    public void ping(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("platform", "android");
        call.resolve(result);
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        try {
            JSArray scopesArray = call.getArray("scopes");
            List<Scope> scopes = new ArrayList<>();
            if (scopesArray != null) {
                for (int i = 0; i < scopesArray.length(); i += 1) {
                    String value = scopesArray.getString(i);
                    if (value != null && !value.trim().isEmpty()) {
                        scopes.add(new Scope(value.trim()));
                    }
                }
            }

            if (scopes.isEmpty()) {
                call.reject("Aucun scope Drive demande.");
                return;
            }

            AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(scopes)
                .build();

            Identity.getAuthorizationClient(getContext())
                .authorize(request)
                .addOnSuccessListener(result -> handleAuthorizationResult(call, result))
                .addOnFailureListener(error -> call.reject(error.getMessage(), error));
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        JSObject result = new JSObject();
        result.put("cleared", true);
        call.resolve(result);
    }

    private void handleAuthorizationResult(PluginCall call, AuthorizationResult result) {
        try {
            String accessToken = result.getAccessToken();
            if (accessToken != null && !accessToken.isEmpty()) {
                call.resolve(toTokenPayload(result));
                return;
            }

            PendingIntent pendingIntent = result.getPendingIntent();
            if (pendingIntent != null) {
                Intent proxyIntent = new Intent(getContext(), GoogleAuthorizationProxyActivity.class);
                proxyIntent.putExtra(EXTRA_PENDING_INTENT, pendingIntent);
                startActivityForResult(call, proxyIntent, "handleAuthorizationActivityResult");
                return;
            }

            call.reject("Aucun access token Google recu.");
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @ActivityCallback
    private void handleAuthorizationActivityResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Autorisation Google Drive annulee.");
            return;
        }

        try {
            AuthorizationResult authorizationResult = Identity.getAuthorizationClient(getContext())
                .getAuthorizationResultFromIntent(result.getData());
            String accessToken = authorizationResult.getAccessToken();
            if (accessToken == null || accessToken.isEmpty()) {
                call.reject("Google Drive n a pas fourni de token d acces.");
                return;
            }
            call.resolve(toTokenPayload(authorizationResult));
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    private JSObject toTokenPayload(AuthorizationResult result) {
        JSObject payload = new JSObject();
        payload.put("accessToken", result.getAccessToken());
        payload.put("grantedScopes", result.getGrantedScopes() == null ? "" : joinGrantedScopes(result.getGrantedScopes()));
        payload.put("expiresIn", 3300);
        payload.put("tokenType", "Bearer");
        return payload;
    }

    private String joinGrantedScopes(List<String> scopes) {
        List<String> values = new ArrayList<>();
        for (String scope : scopes) {
            if (scope != null && !scope.isEmpty()) {
                values.add(scope);
            }
        }
        return String.join(" ", values);
    }
}
