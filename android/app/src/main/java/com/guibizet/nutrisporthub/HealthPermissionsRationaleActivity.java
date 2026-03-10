package com.guibizet.nutrisporthub;

import android.app.AlertDialog;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

public class HealthPermissionsRationaleActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        new AlertDialog.Builder(this)
            .setTitle("Acces sante")
            .setMessage("Nutri Sport Hub lit uniquement les donnees utiles au suivi: poids, pas, sommeil et FC repos. Les donnees restent dans ton app puis peuvent etre synchronisees via Google Drive.")
            .setPositiveButton("OK", (dialog, which) -> finish())
            .setOnDismissListener(dialog -> finish())
            .show();
    }
}
