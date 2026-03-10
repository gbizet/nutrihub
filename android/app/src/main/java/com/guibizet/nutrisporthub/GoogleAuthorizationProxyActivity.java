package com.guibizet.nutrisporthub;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;

public class GoogleAuthorizationProxyActivity extends Activity {

    private static final String EXTRA_PENDING_INTENT = "driveAuthPendingIntent";
    private static final int REQUEST_CODE_GOOGLE_AUTH = 9041;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        PendingIntent pendingIntent = getIntent().getParcelableExtra(EXTRA_PENDING_INTENT);
        if (pendingIntent == null) {
            setResult(Activity.RESULT_CANCELED);
            finish();
            return;
        }

        try {
            startIntentSenderForResult(
                pendingIntent.getIntentSender(),
                REQUEST_CODE_GOOGLE_AUTH,
                null,
                0,
                0,
                0
            );
        } catch (IntentSender.SendIntentException error) {
            Intent result = new Intent();
            result.putExtra("error", error.getMessage());
            setResult(Activity.RESULT_CANCELED, result);
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_GOOGLE_AUTH) {
            setResult(resultCode, data);
            finish();
        }
    }
}
