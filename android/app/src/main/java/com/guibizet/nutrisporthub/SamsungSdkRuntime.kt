package com.guibizet.nutrisporthub

import android.content.Context
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

internal class SamsungSdkRuntime(
    private val context: Context,
    private val zoneId: ZoneId,
    private val samsungHealthPackageName: String,
    private val dataServiceClassName: String,
    private val dataTypesClassName: String,
    private val localTimeFilterClassName: String,
    private val orderingClassName: String,
    private val parcelizeClassName: String,
) {

    fun getSamsungDataStore(): Any =
        invokeStaticMethod(dataServiceClassName, "getStore", context)
            ?: throw IllegalStateException("Samsung Health Data SDK store indisponible.")

    fun samsungReadDataRuntimeError(): String = try {
        loadClassOrNull(parcelizeClassName)
            ?: throw IllegalStateException("Runtime Kotlin Parcelize manquant.")
        val dataType = getStaticField(dataTypesClassName, "BODY_COMPOSITION")
            ?: throw IllegalStateException("Samsung BODY_COMPOSITION indisponible.")
        val builder = invokeMethod(dataType, "getReadDataRequestBuilder")
            ?: throw IllegalStateException("Samsung BODY_COMPOSITION request builder indisponible.")
        val startDateTime = LocalDate.now().minusDays(1).atStartOfDay()
        val endDateTime = LocalDate.now().atStartOfDay()
        val timeFilter = invokeStaticMethod(
            localTimeFilterClassName,
            "of",
            startDateTime,
            endDateTime,
        ) ?: throw IllegalStateException("Samsung LocalTimeFilter indisponible.")
        invokeMethod(builder, "setLocalTimeFilter", timeFilter)
        invokeMethodOrNull(builder, "setLimit", 1)
        invokeMethod(builder, "build")
            ?: throw IllegalStateException("Samsung BODY_COMPOSITION request invalide.")
        ""
    } catch (error: Throwable) {
        error.message?.trim().takeUnless { it.isNullOrEmpty() } ?: error::class.java.simpleName
    }

    fun loadClassOrNull(className: String): Class<*>? = try {
        Class.forName(className)
    } catch (_: Throwable) {
        null
    }

    fun getStaticField(className: String, fieldName: String): Any? =
        loadClassOrNull(className)
            ?.fields
            ?.firstOrNull { it.name == fieldName }
            ?.get(null)

    fun invokeStaticMethod(className: String, methodName: String, vararg args: Any?): Any? {
        val clazz = loadClassOrNull(className) ?: return null
        val method = clazz.methods.firstOrNull { it.name == methodName && it.parameterCount == args.size } ?: return null
        return method.invoke(null, *args)
    }

    fun invokeMethod(target: Any?, methodName: String, vararg args: Any?): Any? {
        if (target == null) return null
        val method = target.javaClass.methods.firstOrNull { it.name == methodName && it.parameterCount == args.size } ?: return null
        return method.invoke(target, *args)
    }

    fun invokeMethodOrNull(target: Any?, methodName: String, vararg args: Any?): Any? = try {
        invokeMethod(target, methodName, *args)
    } catch (_: Throwable) {
        null
    }

    fun awaitAsyncResult(asyncValue: Any?): Any? = invokeMethod(asyncValue, "get")

    fun enumConstant(className: String, constantName: String): Any? =
        loadClassOrNull(className)
            ?.enumConstants
            ?.firstOrNull { value -> (value as? Enum<*>)?.name == constantName }

    fun asObjectSet(value: Any?): Set<Any> = when (value) {
        is Set<*> -> value.filterNotNull().toSet()
        else -> emptySet()
    }

    fun asIterable(value: Any?): List<Any> = when (value) {
        is Iterable<*> -> value.filterNotNull()
        is Array<*> -> value.filterNotNull()
        else -> emptyList()
    }

    fun readSamsungDataPoints(
        dataTypeFieldName: String,
        startDate: LocalDate,
        endDate: LocalDate,
        limit: Int = 256,
    ): List<Any> {
        val dataType = getStaticField(dataTypesClassName, dataTypeFieldName)
            ?: throw IllegalStateException("Samsung $dataTypeFieldName indisponible.")
        val builder = invokeMethod(dataType, "getReadDataRequestBuilder")
            ?: throw IllegalStateException("Samsung $dataTypeFieldName request builder indisponible.")
        val timeFilter = invokeStaticMethod(
            localTimeFilterClassName,
            "of",
            startDate.atStartOfDay(),
            endDate.plusDays(1).atStartOfDay(),
        ) ?: throw IllegalStateException("Samsung LocalTimeFilter indisponible.")
        invokeMethod(builder, "setLocalTimeFilter", timeFilter)
        invokeMethodOrNull(builder, "setOrdering", enumConstant(orderingClassName, "DESC"))
        invokeMethodOrNull(builder, "setLimit", limit)
        val request = invokeMethod(builder, "build")
            ?: throw IllegalStateException("Samsung $dataTypeFieldName request invalide.")
        val response = awaitAsyncResult(invokeMethod(getSamsungDataStore(), "readDataAsync", request))
            ?: throw IllegalStateException("Samsung $dataTypeFieldName response vide.")
        return asIterable(invokeMethod(response, "getDataList"))
    }

    fun readSamsungAggregateNumericValue(
        typeClassName: String,
        operationFieldName: String,
        startDateTime: LocalDateTime,
        endDateTime: LocalDateTime,
    ): Double? {
        val aggregatedValue = readSamsungAggregateValue(typeClassName, operationFieldName, startDateTime, endDateTime) ?: return null
        return when (aggregatedValue) {
            is Number -> aggregatedValue.toDouble()
            else -> aggregatedValue.toString().toDoubleOrNull()
        }
    }

    fun readSamsungAggregateDurationMinutes(
        typeClassName: String,
        operationFieldName: String,
        startDateTime: LocalDateTime,
        endDateTime: LocalDateTime,
    ): Long {
        val aggregatedValue = readSamsungAggregateValue(typeClassName, operationFieldName, startDateTime, endDateTime) ?: return 0L
        return when (aggregatedValue) {
            is Duration -> aggregatedValue.toMinutes()
            is Number -> aggregatedValue.toLong()
            else -> 0L
        }
    }

    private fun readSamsungAggregateValue(
        typeClassName: String,
        operationFieldName: String,
        startDateTime: LocalDateTime,
        endDateTime: LocalDateTime,
    ): Any? {
        val operation = getStaticField(typeClassName, operationFieldName)
            ?: throw IllegalStateException("Samsung aggregate operation $operationFieldName indisponible.")
        val builder = invokeMethod(operation, "getRequestBuilder")
            ?: throw IllegalStateException("Samsung aggregate builder $operationFieldName indisponible.")
        val timeFilter = invokeStaticMethod(
            localTimeFilterClassName,
            "of",
            startDateTime,
            endDateTime,
        ) ?: throw IllegalStateException("Samsung LocalTimeFilter aggregate indisponible.")
        invokeMethod(builder, "setLocalTimeFilter", timeFilter)
        val request = invokeMethod(builder, "build")
            ?: throw IllegalStateException("Samsung aggregate request $operationFieldName invalide.")
        val response = awaitAsyncResult(invokeMethod(getSamsungDataStore(), "aggregateDataAsync", request))
            ?: throw IllegalStateException("Samsung aggregate response $operationFieldName vide.")
        val aggregated = asIterable(invokeMethod(response, "getDataList")).firstOrNull() ?: return null
        return invokeMethodOrNull(aggregated, "getValue")
    }

    fun readSamsungPointStartLocalDateTime(point: Any): LocalDateTime? =
        when (val value = invokeMethodOrNull(point, "getStartLocalDateTime")) {
            is LocalDateTime -> value
            else -> when (val instantValue = invokeMethodOrNull(point, "getStartTime")) {
                is Instant -> instantValue.atZone(zoneId).toLocalDateTime()
                else -> null
            }
        }

    fun readSamsungPointEndLocalDateTime(point: Any): LocalDateTime? =
        when (val value = invokeMethodOrNull(point, "getEndLocalDateTime")) {
            is LocalDateTime -> value
            else -> when (val instantValue = invokeMethodOrNull(point, "getEndTime")) {
                is Instant -> instantValue.atZone(zoneId).toLocalDateTime()
                else -> null
            }
        }

    fun readSamsungPointStartInstant(point: Any): Instant? =
        when (val value = invokeMethodOrNull(point, "getStartTime")) {
            is Instant -> value
            is LocalDateTime -> value.atZone(zoneId).toInstant()
            else -> null
        }

    fun readSamsungPointEndInstant(point: Any): Instant? =
        when (val value = invokeMethodOrNull(point, "getEndTime")) {
            is Instant -> value
            is LocalDateTime -> value.atZone(zoneId).toInstant()
            else -> null
        }

    fun readSamsungPointCapturedAt(point: Any): String =
        when (val updateTime = invokeMethodOrNull(point, "getUpdateTime")) {
            is Instant -> updateTime.toString()
            else -> readSamsungPointEndInstant(point)?.toString()
                ?: readSamsungPointStartInstant(point)?.toString()
                ?: Instant.now().toString()
        }

    fun readSamsungPointId(point: Any): String =
        invokeMethodOrNull(point, "getUid")?.toString()
            ?: invokeMethodOrNull(point, "getUuid")?.toString()
            ?: ""

    fun readSamsungPointSourcePackage(point: Any): String =
        invokeMethodOrNull(invokeMethodOrNull(point, "getDataSource"), "getAppId")?.toString()
            ?: invokeMethodOrNull(invokeMethodOrNull(point, "getDataSource"), "getPackageName")?.toString()
            ?: invokeMethodOrNull(invokeMethodOrNull(point, "getDataSource"), "getName")?.toString()
            ?: samsungHealthPackageName

    fun readSamsungNumericValue(point: Any, field: Any?): Double? {
        val value = invokeMethodOrNull(point, "getValue", field) ?: return null
        return when (value) {
            is Number -> value.toDouble()
            else -> value.toString().toDoubleOrNull()
        }
    }

    fun readSamsungDurationMinutes(point: Any, field: Any?): Long? {
        val value = invokeMethodOrNull(point, "getValue", field) ?: return null
        return when (value) {
            is Duration -> value.toMinutes()
            is Number -> value.toLong()
            else -> null
        }
    }

    fun readSamsungSeriesAverage(point: Any, field: Any?, getterMethod: String): Double? {
        val series = invokeMethodOrNull(point, "getValue", field) ?: return null
        val values = asIterable(series)
            .mapNotNull { entry ->
                when (val rawValue = invokeMethodOrNull(entry, getterMethod)) {
                    is Number -> rawValue.toDouble()
                    else -> rawValue?.toString()?.toDoubleOrNull()
                }
            }
            .filter { it > 0.0 }
        if (values.isEmpty()) return null
        return values.average()
    }

    fun endOfDayInstant(date: String): Instant =
        LocalDate.parse(date).plusDays(1).atStartOfDay(zoneId).toInstant()
}
