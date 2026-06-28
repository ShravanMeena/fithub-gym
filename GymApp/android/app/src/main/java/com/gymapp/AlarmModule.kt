package com.gymapp

import android.app.Activity
import android.content.Intent
import android.provider.AlarmClock
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/**
 * Sets a real, repeating alarm in the phone's Clock app via the system
 * ACTION_SET_ALARM intent. One call with multiple days creates a single weekly
 * alarm that rings on each chosen day. JS weekdays are 0=Sun … 6=Sat and are
 * mapped to Calendar day constants (Sunday=1 … Saturday=7).
 */
class AlarmModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "GymAlarm"

  @ReactMethod
  fun setAlarm(hour: Int, minute: Int, days: ReadableArray, message: String, skipUi: Boolean, promise: Promise) {
    try {
      val dayList = ArrayList<Int>()
      for (i in 0 until days.size()) dayList.add(days.getInt(i) + 1) // 0=Sun -> 1

      val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
        putExtra(AlarmClock.EXTRA_HOUR, hour)
        putExtra(AlarmClock.EXTRA_MINUTES, minute)
        putExtra(AlarmClock.EXTRA_MESSAGE, message)
        putExtra(AlarmClock.EXTRA_VIBRATE, true)
        putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi)
        if (dayList.isNotEmpty()) putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, dayList)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      val activity: Activity? = reactApplicationContext.currentActivity
      if (activity != null) activity.startActivity(intent) else reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ALARM_ERROR", e.message ?: "Could not set the alarm", e)
    }
  }
}
