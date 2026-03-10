package com.guibizet.nutrisporthub;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class BuildConfigTest {

    @Test
    public void applicationId_matches_real_package() {
        assertEquals("com.guibizet.nutrisporthub", BuildConfig.APPLICATION_ID);
    }
}
