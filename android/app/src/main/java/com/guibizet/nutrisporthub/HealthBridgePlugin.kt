package com.guibizet.nutrisporthub

import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.LocalDateTime
import kotlinx.coroutines.runBlocking

@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {

    companion object {
        private const val HEALTH_CONNECT_PACKAGE_NAME = "com.google.android.apps.healthdata"
        private const val SAMSUNG_HEALTH_PACKAGE_NAME = "com.sec.android.app.shealth"
        private const val SAMSUNG_DATA_SERVICE_CLASS_NAME = "com.samsung.android.sdk.health.data.HealthDataService"
        private const val SAMSUNG_PERMISSION_CLASS_NAME = "com.samsung.android.sdk.health.data.permission.Permission"
        private const val SAMSUNG_ACCESS_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.permission.AccessType"
        private const val SAMSUNG_DATA_TYPES_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataTypes"
        private const val SAMSUNG_BODY_COMPOSITION_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$BodyCompositionType"
        private const val SAMSUNG_STEPS_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$StepsType"
        private const val SAMSUNG_SLEEP_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$SleepType"
        private const val SAMSUNG_HEART_RATE_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$HeartRateType"
        private const val SAMSUNG_ACTIVITY_SUMMARY_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$ActivitySummaryType"
        private const val SAMSUNG_BLOOD_PRESSURE_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$BloodPressureType"
        private const val SAMSUNG_BLOOD_OXYGEN_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$BloodOxygenType"
        private const val SAMSUNG_BLOOD_GLUCOSE_TYPE_CLASS_NAME = "com.samsung.android.sdk.health.data.request.DataType\$BloodGlucoseType"
        private const val SAMSUNG_LOCAL_TIME_FILTER_CLASS_NAME = "com.samsung.android.sdk.health.data.request.LocalTimeFilter"
        private const val SAMSUNG_ORDERING_CLASS_NAME = "com.samsung.android.sdk.health.data.request.Ordering"
        private const val SAMSUNG_PARCELIZE_CLASS_NAME = "kotlinx.parcelize.Parceler"
        private const val SAMSUNG_PERMISSION_BODY_COMPOSITION_READ = "samsung.permission.BODY_COMPOSITION_READ"
        private const val SAMSUNG_PERMISSION_STEPS_READ = "samsung.permission.STEPS_READ"
        private const val SAMSUNG_PERMISSION_SLEEP_READ = "samsung.permission.SLEEP_READ"
        private const val SAMSUNG_PERMISSION_HEART_RATE_READ = "samsung.permission.HEART_RATE_READ"
        private const val SAMSUNG_PERMISSION_ACTIVITY_SUMMARY_READ = "samsung.permission.ACTIVITY_SUMMARY_READ"
        private const val SAMSUNG_PERMISSION_BLOOD_PRESSURE_READ = "samsung.permission.BLOOD_PRESSURE_READ"
        private const val SAMSUNG_PERMISSION_BLOOD_OXYGEN_READ = "samsung.permission.BLOOD_OXYGEN_READ"
        private const val SAMSUNG_PERMISSION_BLOOD_GLUCOSE_READ = "samsung.permission.BLOOD_GLUCOSE_READ"
        private const val TAG = "HealthBridgePlugin"
    }

    private data class SamsungPermissionSpec(
        val id: String,
        val dataTypeFieldName: String,
    )

    private data class SamsungResolvedPermission(
        val spec: SamsungPermissionSpec,
        val permission: Any,
        val key: String,
    )

    private val zoneId: ZoneId = ZoneId.systemDefault()
    private val providerPackageName = HEALTH_CONNECT_PACKAGE_NAME
    private val permissionContract = PermissionController.createRequestPermissionResultContract(providerPackageName)
    @Volatile
    private var samsungLastError: String = ""
    @Volatile
    private var samsungReadDataLastError: String = ""
    private val readWeightPermission = HealthPermission.getReadPermission(WeightRecord::class)
    private val readBodyFatPermission = HealthPermission.getReadPermission(BodyFatRecord::class)
    private val readLeanBodyMassPermission = HealthPermission.getReadPermission(LeanBodyMassRecord::class)
    private val readStepsPermission = HealthPermission.getReadPermission(StepsRecord::class)
    private val readActiveCaloriesPermission = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
    private val readTotalCaloriesPermission = HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class)
    private val readExercisePermission = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    private val readSleepPermission = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val readHeartRatePermission = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val readRestingHeartRatePermission = HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    private val readHeartRateVariabilityPermission = HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)
    private val readBloodPressurePermission = HealthPermission.getReadPermission(BloodPressureRecord::class)
    private val readOxygenSaturationPermission = HealthPermission.getReadPermission(OxygenSaturationRecord::class)
    private val readBloodGlucosePermission = HealthPermission.getReadPermission(BloodGlucoseRecord::class)
    private val requestedPermissions = setOf(
        readWeightPermission,
        readBodyFatPermission,
        readLeanBodyMassPermission,
        readStepsPermission,
        readActiveCaloriesPermission,
        readTotalCaloriesPermission,
        readExercisePermission,
        readSleepPermission,
        readHeartRatePermission,
        readRestingHeartRatePermission,
        readHeartRateVariabilityPermission,
        readBloodPressurePermission,
        readOxygenSaturationPermission,
        readBloodGlucosePermission,
    )
    private val samsungPermissionSpecs = listOf(
        SamsungPermissionSpec(SAMSUNG_PERMISSION_BODY_COMPOSITION_READ, "BODY_COMPOSITION"),
        SamsungPermissionSpec(SAMSUNG_PERMISSION_STEPS_READ, "STEPS"),
        SamsungPermissionSpec(SAMSUNG_PERMISSION_SLEEP_READ, "SLEEP"),
        SamsungPermissionSpec(SAMSUNG_PERMISSION_HEART_RATE_READ, "HEART_RATE"),
        SamsungPermissionSpec(SAMSUNG_PERMISSION_ACTIVITY_SUMMARY_READ, "ACTIVITY_SUMMARY"),
        SamsungPermissionSpec(SAMSUNG_PERMISSION_BLOOD_PRESSURE_READ, "BLOOD_PRESSURE"),
        SamsungPermissionSpec(SAMSUNG_PERMISSION_BLOOD_OXYGEN_READ, "BLOOD_OXYGEN"),
        SamsungPermissionSpec(SAMSUNG_PERMISSION_BLOOD_GLUCOSE_READ, "BLOOD_GLUCOSE"),
    )
    private val samsungSdkRuntime: SamsungSdkRuntime by lazy {
        SamsungSdkRuntime(
            context = context,
            zoneId = zoneId,
            samsungHealthPackageName = SAMSUNG_HEALTH_PACKAGE_NAME,
            dataServiceClassName = SAMSUNG_DATA_SERVICE_CLASS_NAME,
            dataTypesClassName = SAMSUNG_DATA_TYPES_CLASS_NAME,
            localTimeFilterClassName = SAMSUNG_LOCAL_TIME_FILTER_CLASS_NAME,
            orderingClassName = SAMSUNG_ORDERING_CLASS_NAME,
            parcelizeClassName = SAMSUNG_PARCELIZE_CLASS_NAME,
        )
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        try {
            val payload = buildStatusPayload(includeGrantedPermissions = true)
            Log.i(TAG, "getStatus: sdk=${payload.get("sdkStatus")} hc=${payload.get("healthConnectAvailable")} samsung=${payload.get("samsungHealthAvailable")}")
            call.resolve(payload)
        } catch (error: Exception) {
            Log.e(TAG, "getStatus failed", error)
            call.reject(error.message ?: "Statut Health Connect indisponible.", error)
        }
    }

    @PluginMethod
    fun requestImportPermissions(call: PluginCall) {
        try {
            val sdkStatus = getSdkStatus()
            val samsungReady = canAttemptSamsungDataSdkFallback()
            Log.i(TAG, "requestImportPermissions: sdkStatus=$sdkStatus samsungReady=$samsungReady")
            if (sdkStatus == HealthConnectClient.SDK_AVAILABLE) {
                val intent = permissionContract.createIntent(context, requestedPermissions)
                startActivityForResult(call, intent, "handlePermissionsResult")
                return
            }

            if (!samsungReady) {
                call.reject(statusReason(sdkStatus))
                return
            }

            Thread {
                try {
                    val samsungGrantedPermissions = requestSamsungPermissions()
                    val payload = buildStatusPayload(includeGrantedPermissions = true)
                    payload.put("samsungDataSdkGrantedPermissions", toJsonArray(samsungGrantedPermissions))
                    payload.put("permissionRequestCompleted", true)
                    call.resolve(payload)
                } catch (error: Exception) {
                    Log.e(TAG, "requestImportPermissions samsung-only failed", error)
                    call.reject(error.message ?: "Demande de permissions Samsung Health impossible.", error)
                }
            }.start()
        } catch (error: Exception) {
            Log.e(TAG, "requestImportPermissions failed", error)
            call.reject(error.message ?: "Demande de permissions sante impossible.", error)
        }
    }

    @PluginMethod
    fun importSnapshot(call: PluginCall) {
        val sdkStatus = getSdkStatus()
        val samsungBodyFallbackReady = canAttemptSamsungBodyFallback()
        Log.i(TAG, "importSnapshot: sdkStatus=$sdkStatus samsungBodyFallbackReady=$samsungBodyFallbackReady")
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE && !samsungBodyFallbackReady) {
            call.reject(statusReason(sdkStatus))
            return
        }

        val startDate = parseDate(call.getString("startDate")) ?: LocalDate.now().minusDays(30)
        val endDate = parseDate(call.getString("endDate")) ?: LocalDate.now()
        if (endDate.isBefore(startDate)) {
            call.reject("La plage d import sante est invalide.")
            return
        }

        Thread {
            try {
                val payload = runBlocking { buildSnapshotPayload(startDate, endDate) }
                val records = payload.getJSObject("records")
                Log.i(
                    TAG,
                    "importSnapshot success: weights=${records?.getJSONArray("bodyMetrics")?.length() ?: 0}, steps=${records?.getJSONArray("activity")?.length() ?: 0}, sleep=${records?.getJSONArray("sleep")?.length() ?: 0}, vitals=${records?.getJSONArray("vitals")?.length() ?: 0}",
                )
                call.resolve(payload)
            } catch (error: Exception) {
                Log.e(TAG, "importSnapshot failed", error)
                call.reject(error.message ?: "Import Health Connect impossible.", error)
            }
        }.start()
    }

    @ActivityCallback
    private fun handlePermissionsResult(call: PluginCall, result: ActivityResult) {
        try {
            val grantedFromResult = permissionContract.parseResult(result.resultCode, result.data).orEmpty()
            val granted = runBlocking {
                HealthConnectClient.getOrCreate(context, providerPackageName)
                    .permissionController
                    .getGrantedPermissions()
            }
            Log.i(
                TAG,
                "handlePermissionsResult: grantedFromResult=${grantedFromResult.size} grantedNow=${granted.size} missing=${requestedPermissions.size - granted.size}",
            )
            val samsungGrantedPermissions = try {
                requestSamsungPermissions()
            } catch (error: Exception) {
                Log.w(TAG, "Samsung permission request after Health Connect failed", error)
                emptySet()
            }
            val payload = buildStatusPayload(includeGrantedPermissions = true)
            payload.put("grantedPermissions", toJsonArray(granted))
            payload.put("missingPermissions", toJsonArray(requestedPermissions.filterNot { granted.contains(it) }))
            payload.put("samsungDataSdkGrantedPermissions", toJsonArray(samsungGrantedPermissions))
            payload.put("samsungDataSdkMissingPermissions", toJsonArray(samsungDataSdkMissingPermissionIds(samsungGrantedPermissions)))
            payload.put("permissionRequestCompleted", true)
            call.resolve(payload)
        } catch (error: Exception) {
            Log.e(TAG, "handlePermissionsResult failed", error)
            call.reject(error.message ?: "Lecture du resultat de permissions sante impossible.", error)
        }
    }

    private suspend fun buildSnapshotPayload(startDate: LocalDate, endDate: LocalDate): JSObject {
        samsungReadDataLastError = ""
        val healthConnectAvailable = getSdkStatus() == HealthConnectClient.SDK_AVAILABLE
        val granted = if (healthConnectAvailable) {
            HealthConnectClient.getOrCreate(context, providerPackageName)
                .permissionController
                .getGrantedPermissions()
        } else {
            emptySet()
        }
        val samsungGrantedPermissionIds = samsungGrantedPermissionIds()

        val client = if (healthConnectAvailable) HealthConnectClient.getOrCreate(context, providerPackageName) else null
        val healthConnectBodyMetrics = if (client != null) readBodyMetricRows(client, startDate, endDate, granted) else JSArray()
        val samsungBodyMetrics = readSamsungBodyCompositionRows(startDate, endDate, samsungGrantedPermissionIds)
        val bodyMetrics = mergeRows(samsungBodyMetrics, healthConnectBodyMetrics)
        val healthConnectActivity = if (client != null) readActivityRows(client, startDate, endDate, granted) else JSArray()
        val samsungActivity = readSamsungActivityRows(startDate, endDate, samsungGrantedPermissionIds)
        val activity = mergeRows(samsungActivity, healthConnectActivity)
        val healthConnectSleep = if (client != null) readSleepRows(client, startDate, endDate, granted) else JSArray()
        val samsungSleep = readSamsungSleepRows(startDate, endDate, samsungGrantedPermissionIds)
        val sleep = mergeRows(samsungSleep, healthConnectSleep)
        val healthConnectVitals = if (client != null) readVitalsRows(client, startDate, endDate, granted) else JSArray()
        val samsungVitals = readSamsungVitalsRows(startDate, endDate, samsungGrantedPermissionIds)
        val vitals = mergeRows(samsungVitals, healthConnectVitals)

        val records = JSObject()
        records.put("bodyMetrics", bodyMetrics)
        records.put("activity", activity)
        records.put("sleep", sleep)
        records.put("vitals", vitals)

        val payload = JSObject()
        payload.put("provider", if (healthConnectAvailable) "health-connect" else "samsung-health")
        payload.put("importedAt", Instant.now().toString())
        payload.put("startDate", startDate.toString())
        payload.put("endDate", endDate.toString())
        payload.put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
        payload.put("permissions", toJsonArray((granted + samsungGrantedPermissionIds).sorted()))
        payload.put("records", records)
        return payload
    }

    private suspend fun readBodyMetricRows(
        client: HealthConnectClient,
        startDate: LocalDate,
        endDate: LocalDate,
        grantedPermissions: Set<String>,
    ): JSArray {
        val rowsByDate = linkedMapOf<String, JSObject>()
        val canReadWeight = grantedPermissions.contains(readWeightPermission)
        val canReadBodyFat = grantedPermissions.contains(readBodyFatPermission)
        val canReadLeanMass = grantedPermissions.contains(readLeanBodyMassPermission)

        val weightRecords = if (canReadWeight) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = WeightRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }

        weightRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("weightKg", record.weight.inKilograms)
            }

        val bodyFatRecords = if (canReadBodyFat) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = BodyFatRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }
        bodyFatRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("bodyFatPercent", record.percentage.value)
            }

        val leanMassRecords = if (canReadLeanMass) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = LeanBodyMassRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }
        leanMassRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("muscleMassKg", record.mass.inKilograms)
            }

        Log.i(
            TAG,
            "body metrics detail: weight=${weightRecords.size} ${describeOrigins(weightRecords)}, bodyFat=${bodyFatRecords.size} ${describeOrigins(bodyFatRecords)}, leanMass=${leanMassRecords.size} ${describeOrigins(leanMassRecords)}",
        )

        return toJsonArray(rowsByDate.values)
    }

    private suspend fun readActivityRows(
        client: HealthConnectClient,
        startDate: LocalDate,
        endDate: LocalDate,
        grantedPermissions: Set<String>,
    ): JSArray {
        val rows = JSArray()
        var totalCaloriesDays = 0
        var cursor = startDate
        val canReadSteps = grantedPermissions.contains(readStepsPermission)
        val canReadActiveCalories = grantedPermissions.contains(readActiveCaloriesPermission)
        val canReadTotalCalories = grantedPermissions.contains(readTotalCaloriesPermission)
        val canReadExercise = grantedPermissions.contains(readExercisePermission)

        if (!canReadSteps && !canReadActiveCalories && !canReadExercise && !canReadTotalCalories) {
            Log.i(TAG, "activity detail: skipped, no Health Connect activity permission granted")
            return rows
        }

        while (!cursor.isAfter(endDate)) {
            val startInstant = cursor.atStartOfDay(zoneId).toInstant()
            val endInstant = cursor.plusDays(1).atStartOfDay(zoneId).toInstant()
            val metrics = buildSet {
                if (canReadSteps) add(StepsRecord.COUNT_TOTAL)
                if (canReadActiveCalories) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
                if (canReadTotalCalories) add(TotalCaloriesBurnedRecord.ENERGY_TOTAL)
                if (canReadExercise) add(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)
            }
            val aggregate = client.aggregate(
                AggregateRequest(
                    metrics = metrics,
                    timeRangeFilter = TimeRangeFilter.between(startInstant, endInstant),
                ),
            )

            val steps = if (canReadSteps) aggregate[StepsRecord.COUNT_TOTAL] ?: 0L else 0L
            val activeCalories = if (canReadActiveCalories) aggregate[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0 else 0.0
            val totalCaloriesRaw = if (canReadTotalCalories) aggregate[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0 else 0.0
            if (totalCaloriesRaw > 0.0) totalCaloriesDays += 1
            val activeMinutes = if (canReadExercise) aggregate[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes() ?: 0L else 0L
            if (steps > 0 || activeCalories > 0.0 || activeMinutes > 0L) {
                val row = baseRow(cursor.toString(), endInstant.toString(), "")
                if (steps > 0) row.put("steps", steps)
                if (activeCalories > 0.0) row.put("activeCalories", activeCalories)
                if (activeMinutes > 0L) row.put("activeMinutes", activeMinutes)
                rows.put(row)
            }

            cursor = cursor.plusDays(1)
        }

        Log.i(
            TAG,
            "activity detail: days=${rows.length()} steps/active/exercise aggregate over ${startDate}..${endDate} (activeCaloriesOnly, totalCaloriesObserved=${totalCaloriesDays})",
        )

        return rows
    }

    private suspend fun readSleepRows(
        client: HealthConnectClient,
        startDate: LocalDate,
        endDate: LocalDate,
        grantedPermissions: Set<String>,
    ): JSArray {
        if (!grantedPermissions.contains(readSleepPermission)) {
            Log.i(TAG, "sleep detail: skipped, no Health Connect sleep permission granted")
            return JSArray()
        }

        val response = client.readRecords(
            ReadRecordsRequest(
                recordType = SleepSessionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(
                    startDate.minusDays(1).atStartOfDay(zoneId).toInstant(),
                    endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                ),
            ),
        )

        val longestPerDay = linkedMapOf<String, SleepSessionRecord>()
        response.records
            .sortedBy { it.endTime }
            .forEach { record ->
                val date = record.endTime.atZone(zoneId).toLocalDate().toString()
                val existing = longestPerDay[date]
                if (existing == null || Duration.between(existing.startTime, existing.endTime) < Duration.between(record.startTime, record.endTime)) {
                    longestPerDay[date] = record
                }
            }

        val rows = JSArray()
        longestPerDay.forEach { (date, record) ->
            val durationMinutes = Duration.between(record.startTime, record.endTime).toMinutes().coerceAtLeast(0)
            if (durationMinutes <= 0) return@forEach

            val row = JSObject()
            row.put("date", date)
            row.put("capturedAt", record.endTime.toString())
            row.put("startTime", record.startTime.toString())
            row.put("endTime", record.endTime.toString())
            row.put("sleepHours", durationMinutes / 60.0)
            row.put("sourceRecordId", record.metadata.id)
            row.put("sourcePackage", record.metadata.dataOrigin.packageName)
            rows.put(row)
        }
        Log.i(TAG, "sleep detail: sessions=${response.records.size} ${describeOrigins(response.records)}, days=${rows.length()}")
        return rows
    }

    private suspend fun readVitalsRows(
        client: HealthConnectClient,
        startDate: LocalDate,
        endDate: LocalDate,
        grantedPermissions: Set<String>,
    ): JSArray {
        val rowsByDate = linkedMapOf<String, JSObject>()
        val canReadHeartRate = grantedPermissions.contains(readHeartRatePermission)
        val canReadRestingHeartRate = grantedPermissions.contains(readRestingHeartRatePermission)
        val canReadHrv = grantedPermissions.contains(readHeartRateVariabilityPermission)
        val canReadBloodPressure = grantedPermissions.contains(readBloodPressurePermission)
        val canReadOxygen = grantedPermissions.contains(readOxygenSaturationPermission)
        val canReadGlucose = grantedPermissions.contains(readBloodGlucosePermission)

        if (!canReadHeartRate && !canReadRestingHeartRate && !canReadHrv && !canReadBloodPressure && !canReadOxygen && !canReadGlucose) {
            Log.i(TAG, "vitals detail: skipped, no Health Connect vitals permission granted")
            return JSArray()
        }

        if (canReadHeartRate) {
            var cursor = startDate
            while (!cursor.isAfter(endDate)) {
                val startInstant = cursor.atStartOfDay(zoneId).toInstant()
                val endInstant = cursor.plusDays(1).atStartOfDay(zoneId).toInstant()
                val aggregate = client.aggregate(
                    AggregateRequest(
                        metrics = setOf(HeartRateRecord.BPM_AVG),
                        timeRangeFilter = TimeRangeFilter.between(startInstant, endInstant),
                    ),
                )
                val avgHeartRate = aggregate[HeartRateRecord.BPM_AVG] ?: 0L
                if (avgHeartRate > 0) {
                    val row = rowsByDate.getOrPut(cursor.toString()) { baseRow(cursor.toString(), endInstant.toString(), "") }
                    row.put("heartRateAvg", avgHeartRate)
                }
                cursor = cursor.plusDays(1)
            }
        }

        val restingRecords = if (canReadRestingHeartRate) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = RestingHeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }

        restingRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("restingHeartRate", record.beatsPerMinute.toLong())
            }

        val hrvRecords = if (canReadHrv) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateVariabilityRmssdRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }
        hrvRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("hrvMs", record.heartRateVariabilityMillis)
            }

        val bloodPressureRecords = if (canReadBloodPressure) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = BloodPressureRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }
        bloodPressureRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("bloodPressureSystolic", record.systolic.inMillimetersOfMercury)
                row.put("bloodPressureDiastolic", record.diastolic.inMillimetersOfMercury)
            }

        val oxygenRecords = if (canReadOxygen) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = OxygenSaturationRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }
        oxygenRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("oxygenSaturationPercent", record.percentage.value)
            }

        val glucoseRecords = if (canReadGlucose) {
            client.readRecords(
                ReadRecordsRequest(
                    recordType = BloodGlucoseRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(
                        startDate.atStartOfDay(zoneId).toInstant(),
                        endDate.plusDays(1).atStartOfDay(zoneId).toInstant(),
                    ),
                ),
            ).records
        } else {
            emptyList()
        }
        glucoseRecords
            .sortedBy { it.time }
            .forEach { record ->
                val date = record.time.atZone(zoneId).toLocalDate().toString()
                val row = rowsByDate.getOrPut(date) { baseRow(date, record.time.toString(), record.metadata.id) }
                row.put("capturedAt", record.time.toString())
                row.put("sourceRecordId", record.metadata.id)
                row.put("sourcePackage", record.metadata.dataOrigin.packageName)
                row.put("bloodGlucoseMgDl", record.level.inMilligramsPerDeciliter)
            }

        Log.i(
            TAG,
            "vitals detail: resting=${restingRecords.size} ${describeOrigins(restingRecords)}, hrv=${hrvRecords.size} ${describeOrigins(hrvRecords)}, bp=${bloodPressureRecords.size} ${describeOrigins(bloodPressureRecords)}, oxygen=${oxygenRecords.size} ${describeOrigins(oxygenRecords)}, glucose=${glucoseRecords.size} ${describeOrigins(glucoseRecords)}, days=${rowsByDate.size}",
        )

        return toJsonArray(rowsByDate.values)
    }

    private fun buildStatusPayload(includeGrantedPermissions: Boolean): JSObject {
        val sdkStatus = getSdkStatus()
        val samsungHealthAvailable = isPackageInstalled(SAMSUNG_HEALTH_PACKAGE_NAME)
        val samsungDataSdkBundled = isSamsungDataSdkBundled()
        val samsungGrantedPermissions = if (samsungDataSdkBundled && samsungHealthAvailable) {
            samsungGrantedPermissionIds()
        } else {
            emptySet()
        }
        val samsungMissingPermissions = if (samsungDataSdkBundled && samsungHealthAvailable) {
            samsungDataSdkMissingPermissionIds(samsungGrantedPermissions)
        } else {
            emptySet()
        }
        val samsungReadDataRuntimeError = samsungReadDataLastError.ifBlank {
            if (
                samsungDataSdkBundled &&
                samsungHealthAvailable &&
                samsungGrantedPermissions.isNotEmpty()
            ) {
                samsungReadDataRuntimeError()
            } else {
                ""
            }
        }
        val effectiveSamsungError = samsungReadDataRuntimeError.ifBlank { samsungLastError }
        val payload = JSObject()
        payload.put("platform", "android")
        payload.put("isNative", true)
        payload.put("isAndroid", true)
        payload.put("provider", "health-connect")
        payload.put("healthConnectAvailable", sdkStatus == HealthConnectClient.SDK_AVAILABLE)
        payload.put("samsungHealthAvailable", samsungHealthAvailable)
        payload.put("samsungDataSdkBundled", samsungDataSdkBundled)
        payload.put("samsungReadDataRuntimeError", samsungReadDataRuntimeError)
        payload.put("samsungLastError", effectiveSamsungError)
        payload.put("samsungDataSdkRequiresDeveloperMode", requiresSamsungDeveloperMode())
        payload.put("samsungDataSdkGrantedPermissions", toJsonArray(samsungGrantedPermissions))
        payload.put("samsungDataSdkMissingPermissions", toJsonArray(samsungMissingPermissions))
        payload.put(
            "samsungBodyCompositionFallbackAvailable",
            samsungGrantedPermissions.contains(SAMSUNG_PERMISSION_BODY_COMPOSITION_READ) && samsungReadDataRuntimeError.isBlank(),
        )
        payload.put("samsungDataSdkFallbackAvailable", samsungGrantedPermissions.isNotEmpty() && samsungReadDataRuntimeError.isBlank())
        payload.put(
            "samsungWeightFallbackReason",
            samsungWeightFallbackReason(
                samsungDataSdkBundled,
                samsungHealthAvailable,
                samsungMissingPermissions,
                samsungReadDataRuntimeError,
                effectiveSamsungError,
            ),
        )
        payload.put("sdkStatus", sdkStatus)
        payload.put(
            "reason",
            buildPlatformReason(
                sdkStatus,
                samsungDataSdkBundled,
                samsungHealthAvailable,
                samsungGrantedPermissions,
                samsungMissingPermissions,
                effectiveSamsungError,
            ),
        )
        payload.put("supportedStreams", supportedStreams())

        if (sdkStatus == HealthConnectClient.SDK_AVAILABLE) {
            val granted = runBlocking {
                HealthConnectClient.getOrCreate(context, providerPackageName)
                    .permissionController
                    .getGrantedPermissions()
            }
            payload.put("grantedPermissions", toJsonArray(granted))
            payload.put("missingPermissions", toJsonArray(requestedPermissions.filterNot { granted.contains(it) }))
        } else {
            payload.put("grantedPermissions", JSArray())
            payload.put("missingPermissions", toJsonArray(requestedPermissions))
        }

        return payload
    }

    private fun getSdkStatus(): Int =
        HealthConnectClient.getSdkStatus(context, providerPackageName)

    private fun parseDate(raw: String?): LocalDate? = try {
        if (raw.isNullOrBlank()) null else LocalDate.parse(raw.trim())
    } catch (_: Exception) {
        null
    }

    private fun statusReason(sdkStatus: Int): String = when (sdkStatus) {
        HealthConnectClient.SDK_AVAILABLE -> "Health Connect disponible."
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "Health Connect doit etre installe ou mis a jour."
        else -> "Health Connect indisponible sur cet appareil."
    }

    private fun buildPlatformReason(
        sdkStatus: Int,
        samsungDataSdkBundled: Boolean,
        samsungHealthAvailable: Boolean,
        samsungGrantedPermissions: Set<String>,
        samsungMissingPermissions: Set<String>,
        effectiveSamsungError: String,
    ): String = when {
        sdkStatus == HealthConnectClient.SDK_AVAILABLE && samsungDataSdkBundled && samsungHealthAvailable && samsungGrantedPermissions.isNotEmpty() && effectiveSamsungError.isBlank() ->
            "Health Connect disponible. Fallback Samsung direct egalement pret."
        sdkStatus == HealthConnectClient.SDK_AVAILABLE && effectiveSamsungError.isNotBlank() ->
            "Health Connect disponible. Samsung direct bloque: ${effectiveSamsungError}"
        sdkStatus == HealthConnectClient.SDK_AVAILABLE ->
            statusReason(sdkStatus)
        samsungDataSdkBundled && samsungHealthAvailable && samsungGrantedPermissions.isNotEmpty() && effectiveSamsungError.isBlank() ->
            "Health Connect indisponible. Fallback Samsung direct pret."
        samsungDataSdkBundled && samsungHealthAvailable && effectiveSamsungError.isNotBlank() ->
            "Health Connect indisponible. Samsung direct bloque: ${effectiveSamsungError}"
        samsungDataSdkBundled && samsungHealthAvailable && samsungMissingPermissions.isNotEmpty() ->
            "Health Connect indisponible. Fallback Samsung direct detecte mais permissions Samsung manquantes."
        else ->
            statusReason(sdkStatus)
    }

    private fun isPackageInstalled(packageName: String): Boolean = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(packageName, 0)
        }
        true
    } catch (_: Exception) {
        false
    }

    private fun supportedStreams(): JSArray {
        val streams = JSArray()
        streams.put(stream("weight", "Poids", "metrics"))
        streams.put(stream("body-composition", "Composition", "metrics"))
        streams.put(stream("steps", "Pas", "neatLogs"))
        streams.put(stream("active-calories", "Calories actives", "neatLogs"))
        streams.put(stream("active-minutes", "Minutes actives", "neatLogs"))
        streams.put(stream("sleep", "Sommeil", "dailyLogs"))
        streams.put(stream("heart-rate", "FC moyenne", "dailyLogs"))
        streams.put(stream("resting-heart-rate", "FC repos", "dailyLogs"))
        streams.put(stream("hrv", "HRV", "dailyLogs"))
        streams.put(stream("blood-pressure", "Tension", "dailyLogs"))
        streams.put(stream("oxygen-saturation", "Oxygene", "dailyLogs"))
        streams.put(stream("blood-glucose", "Glycemie", "dailyLogs"))
        return streams
    }

    private fun baseRow(date: String, capturedAt: String, sourceRecordId: String, provider: String = "health-connect"): JSObject {
        val row = JSObject()
        row.put("date", date)
        row.put("capturedAt", capturedAt)
        row.put("sourceRecordId", sourceRecordId)
        row.put("sourcePackage", "")
        row.put("provider", provider)
        return row
    }

    private fun mergeRows(first: JSArray, second: JSArray): JSArray {
        val merged = JSArray()
        for (index in 0 until first.length()) {
            merged.put(first.opt(index))
        }
        for (index in 0 until second.length()) {
            merged.put(second.opt(index))
        }
        return merged
    }

    private fun canAttemptSamsungDataSdkFallback(): Boolean =
        isPackageInstalled(SAMSUNG_HEALTH_PACKAGE_NAME) && isSamsungDataSdkBundled()

    private fun canAttemptSamsungBodyFallback(): Boolean =
        canAttemptSamsungDataSdkFallback()

    private fun isSamsungDataSdkBundled(): Boolean =
        loadClassOrNull(SAMSUNG_DATA_SERVICE_CLASS_NAME) != null

    private fun resolveSamsungPermissionSpecs(): List<SamsungResolvedPermission> =
        samsungPermissionSpecs.mapNotNull { spec ->
            val dataType = getStaticField(SAMSUNG_DATA_TYPES_CLASS_NAME, spec.dataTypeFieldName) ?: return@mapNotNull null
            val permission = invokeStaticMethod(
                SAMSUNG_PERMISSION_CLASS_NAME,
                "of",
                dataType,
                enumConstant(SAMSUNG_ACCESS_TYPE_CLASS_NAME, "READ"),
            ) ?: return@mapNotNull null
            val key = samsungPermissionKey(permission) ?: return@mapNotNull null
            SamsungResolvedPermission(spec, permission, key)
        }

    private fun samsungGrantedPermissionIds(): Set<String> {
        if (!canAttemptSamsungDataSdkFallback()) return emptySet()
        return try {
            val resolvedPermissions = resolveSamsungPermissionSpecs()
            val requiredPermissions = resolvedPermissions.map { it.permission }.toSet()
            val granted = asObjectSet(
                awaitAsyncResult(
                    invokeMethod(
                        getSamsungDataStore(),
                        "getGrantedPermissionsAsync",
                        requiredPermissions,
                    ),
                ),
            )
            val grantedKeys = granted.mapNotNull { permission -> samsungPermissionKey(permission) }.toSet()
            samsungLastError = ""
            resolvedPermissions
                .filter { resolved -> grantedKeys.contains(resolved.key) }
                .map { resolved -> resolved.spec.id }
                .toSet()
        } catch (error: Throwable) {
            noteSamsungError("samsung permission check", error)
            emptySet()
        }
    }

    private fun samsungDataSdkMissingPermissionIds(grantedPermissionIds: Set<String> = samsungGrantedPermissionIds()): Set<String> {
        if (!canAttemptSamsungDataSdkFallback()) return emptySet()
        return samsungPermissionSpecs
            .map { it.id }
            .filterNot { grantedPermissionIds.contains(it) }
            .toSet()
    }

    private fun requestSamsungPermissions(): Set<String> {
        if (!canAttemptSamsungDataSdkFallback()) return emptySet()
        val currentActivity = activity ?: throw IllegalStateException("Activite Android indisponible pour permissions Samsung.")
        val resolvedPermissions = resolveSamsungPermissionSpecs()
        if (resolvedPermissions.isEmpty()) return emptySet()
        return try {
            val granted = asObjectSet(
                awaitAsyncResult(
                    invokeMethod(
                        getSamsungDataStore(),
                        "requestPermissionsAsync",
                        resolvedPermissions.map { it.permission }.toSet(),
                        currentActivity,
                    ),
                ),
            )
            val grantedKeys = granted.mapNotNull { permission -> samsungPermissionKey(permission) }.toSet()
            samsungLastError = ""
            resolvedPermissions
                .filter { resolved -> grantedKeys.contains(resolved.key) }
                .map { resolved -> resolved.spec.id }
                .toSet()
        } catch (error: Throwable) {
            noteSamsungError("samsung permission request", error)
            throw error
        }
    }

    private fun samsungWeightFallbackReason(
        samsungDataSdkBundled: Boolean,
        samsungHealthAvailable: Boolean,
        samsungMissingPermissions: Set<String>,
        samsungReadDataRuntimeError: String,
        effectiveSamsungError: String,
    ): String = when {
        !samsungHealthAvailable -> "Samsung Health non detecte."
        !samsungDataSdkBundled -> "Fallback Samsung direct non bundle. Ajoute l AAR officiel Samsung Health Data SDK dans android/app/libs."
        requiresSamsungDeveloperMode() -> "Fallback Samsung direct detecte mais policy Samsung absente. Active le developer mode Samsung Health ou enregistre l app chez Samsung."
        samsungReadDataRuntimeError.isNotBlank() -> "Fallback Samsung direct detecte mais runtime de lecture bloque: ${samsungReadDataRuntimeError}"
        effectiveSamsungError.isNotBlank() -> "Fallback Samsung direct detecte mais bloque: ${effectiveSamsungError}"
        samsungMissingPermissions.isNotEmpty() -> "Fallback Samsung direct detecte mais permissions Samsung manquantes."
        else -> "Fallback Samsung direct pret pour les flux exposes par le SDK."
    }

    private fun requiresSamsungDeveloperMode(): Boolean =
        samsungLastError.contains("Could not get policy", ignoreCase = true)

    private fun samsungPermissionKey(permission: Any?): String? {
        if (permission == null) return null
        val dataType = invokeMethod(permission, "getDataType") ?: return null
        val dataTypeName = invokeMethod(dataType, "getName")?.toString()?.trim().orEmpty()
        val accessTypeName = invokeMethod(permission, "getAccessType")?.toString()?.trim().orEmpty()
        if (dataTypeName.isBlank() || accessTypeName.isBlank()) return null
        return "$dataTypeName|$accessTypeName"
    }

    private fun readSamsungBodyCompositionRows(startDate: LocalDate, endDate: LocalDate, grantedPermissionIds: Set<String>): JSArray {
        if (!canAttemptSamsungBodyFallback()) return JSArray()
        if (!grantedPermissionIds.contains(SAMSUNG_PERMISSION_BODY_COMPOSITION_READ)) {
            Log.i(TAG, "samsung body fallback skipped: missingPermission=$SAMSUNG_PERMISSION_BODY_COMPOSITION_READ")
            return JSArray()
        }

        return try {
            val points = readSamsungDataPoints("BODY_COMPOSITION", startDate, endDate, limit = 256)
            val rowsByDate = linkedMapOf<String, JSObject>()
            val weightField = getStaticField(SAMSUNG_BODY_COMPOSITION_TYPE_CLASS_NAME, "WEIGHT")
            val bodyFatField = getStaticField(SAMSUNG_BODY_COMPOSITION_TYPE_CLASS_NAME, "BODY_FAT")
            val muscleMassField = getStaticField(SAMSUNG_BODY_COMPOSITION_TYPE_CLASS_NAME, "MUSCLE_MASS")
            val skeletalMuscleField = getStaticField(SAMSUNG_BODY_COMPOSITION_TYPE_CLASS_NAME, "SKELETAL_MUSCLE_MASS")
            val fatFreeMassField = getStaticField(SAMSUNG_BODY_COMPOSITION_TYPE_CLASS_NAME, "FAT_FREE_MASS")
            val totalBodyWaterField = getStaticField(SAMSUNG_BODY_COMPOSITION_TYPE_CLASS_NAME, "TOTAL_BODY_WATER")
            points
                .sortedBy { point -> readSamsungPointStartLocalDateTime(point) ?: LocalDateTime.MIN }
                .forEach { point ->
                    val startTime = readSamsungPointStartLocalDateTime(point) ?: return@forEach
                    val capturedAt = readSamsungPointCapturedAt(point)
                    val date = startTime.toLocalDate().toString()
                    val row = rowsByDate.getOrPut(date) {
                        baseRow(
                            date,
                            capturedAt,
                            readSamsungPointId(point),
                            provider = "samsung-health",
                        )
                    }
                    row.put("provider", "samsung-health")
                    row.put("capturedAt", capturedAt)
                    row.put("sourceRecordId", readSamsungPointId(point))
                    row.put("sourcePackage", readSamsungPointSourcePackage(point))
                    val weightKg = readSamsungNumericValue(point, weightField)
                    val totalBodyWaterKg = readSamsungNumericValue(point, totalBodyWaterField)
                    putIfPresent(row, "weightKg", weightKg)
                    putIfPresent(row, "bodyFatPercent", readSamsungNumericValue(point, bodyFatField))
                    putIfPresent(
                        row,
                        "muscleMassKg",
                        readSamsungNumericValue(point, skeletalMuscleField)
                            ?: readSamsungNumericValue(point, muscleMassField)
                            ?: readSamsungNumericValue(point, fatFreeMassField),
                    )
                    if (weightKg != null && totalBodyWaterKg != null && weightKg > 0.0) {
                        row.put("waterPercent", (totalBodyWaterKg / weightKg) * 100.0)
                    }
                }
            Log.i(TAG, "samsung body fallback detail: days=${rowsByDate.size} sources=[${SAMSUNG_HEALTH_PACKAGE_NAME}]")
            toJsonArray(rowsByDate.values)
        } catch (error: Throwable) {
            noteSamsungReadDataError("samsung body fallback", error)
            JSArray()
        }
    }

    private fun readSamsungActivityRows(startDate: LocalDate, endDate: LocalDate, grantedPermissionIds: Set<String>): JSArray {
        if (!canAttemptSamsungDataSdkFallback()) return JSArray()
        val canReadSteps = grantedPermissionIds.contains(SAMSUNG_PERMISSION_STEPS_READ)
        val canReadActivitySummary = grantedPermissionIds.contains(SAMSUNG_PERMISSION_ACTIVITY_SUMMARY_READ)
        if (!canReadSteps && !canReadActivitySummary) return JSArray()

        return try {
            val rows = JSArray()
            var cursor = startDate
            while (!cursor.isAfter(endDate)) {
                val dayStart = cursor.atStartOfDay()
                val dayEnd = cursor.plusDays(1).atStartOfDay()
                val steps = if (canReadSteps) {
                    readSamsungAggregateNumericValue(SAMSUNG_STEPS_TYPE_CLASS_NAME, "TOTAL", dayStart, dayEnd)?.toLong() ?: 0L
                } else {
                    0L
                }
                val activeCalories = if (canReadActivitySummary) {
                    readSamsungAggregateNumericValue(SAMSUNG_ACTIVITY_SUMMARY_TYPE_CLASS_NAME, "TOTAL_ACTIVE_CALORIES_BURNED", dayStart, dayEnd) ?: 0.0
                } else {
                    0.0
                }
                val activeMinutes = if (canReadActivitySummary) {
                    readSamsungAggregateDurationMinutes(SAMSUNG_ACTIVITY_SUMMARY_TYPE_CLASS_NAME, "TOTAL_ACTIVE_TIME", dayStart, dayEnd)
                } else {
                    0L
                }
                if (steps > 0 || activeCalories > 0.0 || activeMinutes > 0L) {
                    val row = baseRow(
                        cursor.toString(),
                        dayEnd.atZone(zoneId).toInstant().toString(),
                        "samsung-activity-${cursor}",
                        provider = "samsung-health",
                    )
                    row.put("sourcePackage", SAMSUNG_HEALTH_PACKAGE_NAME)
                    if (steps > 0) row.put("steps", steps)
                    if (activeCalories > 0.0) row.put("activeCalories", activeCalories)
                    if (activeMinutes > 0L) row.put("activeMinutes", activeMinutes)
                    rows.put(row)
                }
                cursor = cursor.plusDays(1)
            }
            Log.i(TAG, "samsung activity fallback detail: days=${rows.length()} steps=$canReadSteps activitySummary=$canReadActivitySummary")
            rows
        } catch (error: Throwable) {
            noteSamsungError("samsung activity fallback", error)
            JSArray()
        }
    }

    private fun readSamsungSleepRows(startDate: LocalDate, endDate: LocalDate, grantedPermissionIds: Set<String>): JSArray {
        if (!canAttemptSamsungDataSdkFallback()) return JSArray()
        if (!grantedPermissionIds.contains(SAMSUNG_PERMISSION_SLEEP_READ)) return JSArray()

        return try {
            val points = readSamsungDataPoints("SLEEP", startDate.minusDays(1), endDate, limit = 256)
            val longestPerDay = linkedMapOf<String, JSObject>()
            val durationField = getStaticField(SAMSUNG_SLEEP_TYPE_CLASS_NAME, "DURATION")
            points
                .sortedBy { point -> readSamsungPointEndLocalDateTime(point) ?: LocalDateTime.MIN }
                .forEach { point ->
                    val endLocalDateTime = readSamsungPointEndLocalDateTime(point) ?: return@forEach
                    val startLocalDateTime = readSamsungPointStartLocalDateTime(point) ?: return@forEach
                    val durationMinutes = readSamsungDurationMinutes(point, durationField)
                        ?: Duration.between(startLocalDateTime, endLocalDateTime).toMinutes().coerceAtLeast(0)
                    if (durationMinutes <= 0) return@forEach
                    val date = endLocalDateTime.toLocalDate().toString()
                    val current = longestPerDay[date]
                    val currentDurationMinutes = current?.optLong("durationMinutes", 0L) ?: 0L
                    if (current == null || durationMinutes > currentDurationMinutes) {
                        val row = JSObject()
                        row.put("date", date)
                        row.put("capturedAt", readSamsungPointCapturedAt(point))
                        row.put("startTime", readSamsungPointStartInstant(point)?.toString() ?: "")
                        row.put("endTime", readSamsungPointEndInstant(point)?.toString() ?: "")
                        row.put("sleepHours", durationMinutes / 60.0)
                        row.put("durationMinutes", durationMinutes)
                        row.put("sourceRecordId", readSamsungPointId(point))
                        row.put("sourcePackage", readSamsungPointSourcePackage(point))
                        row.put("provider", "samsung-health")
                        longestPerDay[date] = row
                    }
                }
            val rows = JSArray()
            longestPerDay.values.forEach { row ->
                row.remove("durationMinutes")
                rows.put(row)
            }
            Log.i(TAG, "samsung sleep fallback detail: days=${rows.length()}")
            rows
        } catch (error: Throwable) {
            noteSamsungReadDataError("samsung sleep fallback", error)
            JSArray()
        }
    }

    private fun readSamsungVitalsRows(startDate: LocalDate, endDate: LocalDate, grantedPermissionIds: Set<String>): JSArray {
        if (!canAttemptSamsungDataSdkFallback()) return JSArray()
        val rowsByDate = linkedMapOf<String, JSObject>()

        if (grantedPermissionIds.contains(SAMSUNG_PERMISSION_HEART_RATE_READ)) {
            val heartRateField = getStaticField(SAMSUNG_HEART_RATE_TYPE_CLASS_NAME, "HEART_RATE")
            val seriesDataField = getStaticField(SAMSUNG_HEART_RATE_TYPE_CLASS_NAME, "SERIES_DATA")
            val valuesByDate = linkedMapOf<String, MutableList<Double>>()
            try {
                readSamsungDataPoints("HEART_RATE", startDate, endDate, limit = 256)
                    .forEach { point ->
                        val dateTime = readSamsungPointStartLocalDateTime(point) ?: return@forEach
                        val date = dateTime.toLocalDate().toString()
                        val value = readSamsungNumericValue(point, heartRateField)
                            ?: readSamsungSeriesAverage(point, seriesDataField, "getHeartRate")
                            ?: return@forEach
                        if (value <= 0.0) return@forEach
                        valuesByDate.getOrPut(date) { mutableListOf() }.add(value)
                        val row = rowsByDate.getOrPut(date) {
                            baseRow(
                                date,
                                readSamsungPointCapturedAt(point),
                                readSamsungPointId(point),
                                provider = "samsung-health",
                            )
                        }
                        row.put("capturedAt", readSamsungPointCapturedAt(point))
                        row.put("sourceRecordId", readSamsungPointId(point))
                        row.put("sourcePackage", readSamsungPointSourcePackage(point))
                    }
                valuesByDate.forEach { (date, values) ->
                    val avg = values.average()
                    if (avg > 0.0) {
                        rowsByDate.getOrPut(date) {
                            baseRow(date, endOfDayInstant(date).toString(), "", provider = "samsung-health")
                        }.put("heartRateAvg", avg)
                    }
                }
            } catch (error: Throwable) {
                noteSamsungReadDataError("samsung heart rate fallback", error)
            }
        }

        if (grantedPermissionIds.contains(SAMSUNG_PERMISSION_BLOOD_PRESSURE_READ)) {
            val systolicField = getStaticField(SAMSUNG_BLOOD_PRESSURE_TYPE_CLASS_NAME, "SYSTOLIC")
            val diastolicField = getStaticField(SAMSUNG_BLOOD_PRESSURE_TYPE_CLASS_NAME, "DIASTOLIC")
            try {
                readSamsungDataPoints("BLOOD_PRESSURE", startDate, endDate, limit = 256)
                    .sortedBy { point -> readSamsungPointStartLocalDateTime(point) ?: LocalDateTime.MIN }
                    .forEach { point ->
                        val date = readSamsungPointStartLocalDateTime(point)?.toLocalDate()?.toString() ?: return@forEach
                        val row = rowsByDate.getOrPut(date) {
                            baseRow(date, readSamsungPointCapturedAt(point), readSamsungPointId(point), provider = "samsung-health")
                        }
                        row.put("capturedAt", readSamsungPointCapturedAt(point))
                        row.put("sourceRecordId", readSamsungPointId(point))
                        row.put("sourcePackage", readSamsungPointSourcePackage(point))
                        putIfPresent(row, "bloodPressureSystolic", readSamsungNumericValue(point, systolicField))
                        putIfPresent(row, "bloodPressureDiastolic", readSamsungNumericValue(point, diastolicField))
                    }
            } catch (error: Throwable) {
                noteSamsungReadDataError("samsung blood pressure fallback", error)
            }
        }

        if (grantedPermissionIds.contains(SAMSUNG_PERMISSION_BLOOD_OXYGEN_READ)) {
            val oxygenField = getStaticField(SAMSUNG_BLOOD_OXYGEN_TYPE_CLASS_NAME, "OXYGEN_SATURATION")
            try {
                readSamsungDataPoints("BLOOD_OXYGEN", startDate, endDate, limit = 256)
                    .sortedBy { point -> readSamsungPointStartLocalDateTime(point) ?: LocalDateTime.MIN }
                    .forEach { point ->
                        val date = readSamsungPointStartLocalDateTime(point)?.toLocalDate()?.toString() ?: return@forEach
                        val row = rowsByDate.getOrPut(date) {
                            baseRow(date, readSamsungPointCapturedAt(point), readSamsungPointId(point), provider = "samsung-health")
                        }
                        row.put("capturedAt", readSamsungPointCapturedAt(point))
                        row.put("sourceRecordId", readSamsungPointId(point))
                        row.put("sourcePackage", readSamsungPointSourcePackage(point))
                        putIfPresent(row, "oxygenSaturationPercent", readSamsungNumericValue(point, oxygenField))
                    }
            } catch (error: Throwable) {
                noteSamsungReadDataError("samsung oxygen fallback", error)
            }
        }

        if (grantedPermissionIds.contains(SAMSUNG_PERMISSION_BLOOD_GLUCOSE_READ)) {
            val glucoseField = getStaticField(SAMSUNG_BLOOD_GLUCOSE_TYPE_CLASS_NAME, "GLUCOSE_LEVEL")
            try {
                readSamsungDataPoints("BLOOD_GLUCOSE", startDate, endDate, limit = 256)
                    .sortedBy { point -> readSamsungPointStartLocalDateTime(point) ?: LocalDateTime.MIN }
                    .forEach { point ->
                        val date = readSamsungPointStartLocalDateTime(point)?.toLocalDate()?.toString() ?: return@forEach
                        val row = rowsByDate.getOrPut(date) {
                            baseRow(date, readSamsungPointCapturedAt(point), readSamsungPointId(point), provider = "samsung-health")
                        }
                        row.put("capturedAt", readSamsungPointCapturedAt(point))
                        row.put("sourceRecordId", readSamsungPointId(point))
                        row.put("sourcePackage", readSamsungPointSourcePackage(point))
                        putIfPresent(row, "bloodGlucoseMgDl", readSamsungNumericValue(point, glucoseField))
                    }
            } catch (error: Throwable) {
                noteSamsungReadDataError("samsung glucose fallback", error)
            }
        }

        Log.i(TAG, "samsung vitals fallback detail: days=${rowsByDate.size}")
        return toJsonArray(rowsByDate.values)
    }

    private fun readSamsungDataPoints(
        dataTypeFieldName: String,
        startDate: LocalDate,
        endDate: LocalDate,
        limit: Int = 256,
    ): List<Any> =
        samsungSdkRuntime.readSamsungDataPoints(dataTypeFieldName, startDate, endDate, limit)

    private fun readSamsungAggregateNumericValue(
        typeClassName: String,
        operationFieldName: String,
        startDateTime: LocalDateTime,
        endDateTime: LocalDateTime,
    ): Double? =
        samsungSdkRuntime.readSamsungAggregateNumericValue(typeClassName, operationFieldName, startDateTime, endDateTime)

    private fun readSamsungAggregateDurationMinutes(
        typeClassName: String,
        operationFieldName: String,
        startDateTime: LocalDateTime,
        endDateTime: LocalDateTime,
    ): Long =
        samsungSdkRuntime.readSamsungAggregateDurationMinutes(typeClassName, operationFieldName, startDateTime, endDateTime)

    private fun getSamsungDataStore(): Any =
        samsungSdkRuntime.getSamsungDataStore()

    private fun samsungReadDataRuntimeError(): String = samsungSdkRuntime.samsungReadDataRuntimeError()

    private fun noteSamsungError(label: String, error: Throwable) {
        samsungLastError = extractErrorMessage(error)
        Log.w(TAG, "$label failed", error)
    }

    private fun noteSamsungReadDataError(label: String, error: Throwable) {
        samsungReadDataLastError = extractErrorMessage(error)
        samsungLastError = samsungReadDataLastError
        Log.w(TAG, "$label failed", error)
    }

    private fun extractErrorMessage(error: Throwable): String =
        generateSequence(error) { it.cause }
            .mapNotNull { it.message?.trim() }
            .firstOrNull { it.isNotEmpty() }
            ?: error::class.java.simpleName

    private fun loadClassOrNull(className: String): Class<*>? = samsungSdkRuntime.loadClassOrNull(className)

    private fun getStaticField(className: String, fieldName: String): Any? =
        samsungSdkRuntime.getStaticField(className, fieldName)

    private fun invokeStaticMethod(className: String, methodName: String, vararg args: Any?): Any? =
        samsungSdkRuntime.invokeStaticMethod(className, methodName, *args)

    private fun invokeMethod(target: Any?, methodName: String, vararg args: Any?): Any? =
        samsungSdkRuntime.invokeMethod(target, methodName, *args)

    private fun invokeMethodOrNull(target: Any?, methodName: String, vararg args: Any?): Any? =
        samsungSdkRuntime.invokeMethodOrNull(target, methodName, *args)

    private fun awaitAsyncResult(asyncValue: Any?): Any? = samsungSdkRuntime.awaitAsyncResult(asyncValue)

    private fun enumConstant(className: String, constantName: String): Any? =
        samsungSdkRuntime.enumConstant(className, constantName)

    private fun asObjectSet(value: Any?): Set<Any> = samsungSdkRuntime.asObjectSet(value)

    private fun asIterable(value: Any?): List<Any> = samsungSdkRuntime.asIterable(value)

    private fun readSamsungPointStartLocalDateTime(point: Any): LocalDateTime? =
        samsungSdkRuntime.readSamsungPointStartLocalDateTime(point)

    private fun readSamsungPointEndLocalDateTime(point: Any): LocalDateTime? =
        samsungSdkRuntime.readSamsungPointEndLocalDateTime(point)

    private fun readSamsungPointStartInstant(point: Any): Instant? =
        samsungSdkRuntime.readSamsungPointStartInstant(point)

    private fun readSamsungPointEndInstant(point: Any): Instant? =
        samsungSdkRuntime.readSamsungPointEndInstant(point)

    private fun readSamsungPointCapturedAt(point: Any): String =
        samsungSdkRuntime.readSamsungPointCapturedAt(point)

    private fun readSamsungPointId(point: Any): String =
        samsungSdkRuntime.readSamsungPointId(point)

    private fun readSamsungPointSourcePackage(point: Any): String =
        samsungSdkRuntime.readSamsungPointSourcePackage(point)

    private fun readSamsungNumericValue(point: Any, field: Any?): Double? =
        samsungSdkRuntime.readSamsungNumericValue(point, field)

    private fun readSamsungDurationMinutes(point: Any, field: Any?): Long? =
        samsungSdkRuntime.readSamsungDurationMinutes(point, field)

    private fun readSamsungSeriesAverage(point: Any, field: Any?, getterMethod: String): Double? =
        samsungSdkRuntime.readSamsungSeriesAverage(point, field, getterMethod)

    private fun endOfDayInstant(date: String): Instant =
        samsungSdkRuntime.endOfDayInstant(date)

    private fun putIfPresent(row: JSObject, key: String, value: Double?) {
        if (value != null) {
            row.put(key, value)
        }
    }

    private fun describeOrigins(records: Collection<Record>): String {
        if (records.isEmpty()) return "sources=[]"
        val sources = records
            .mapNotNull { it.metadata.dataOrigin.packageName }
            .distinct()
            .sorted()
        return "sources=${sources.joinToString(prefix = "[", postfix = "]")}"
    }

    private fun stream(id: String, label: String, target: String): JSObject {
        val stream = JSObject()
        stream.put("id", id)
        stream.put("label", label)
        stream.put("target", target)
        return stream
    }

    private fun toJsonArray(values: Collection<*>): JSArray {
        val array = JSArray()
        values.forEach { value -> array.put(value) }
        return array
    }
}
