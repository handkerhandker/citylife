package com.yungang.citylife;

import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/* 第 180 单·全屏铺满（沉浸式）——照《鸿蒙NEXT-卓易通-安卓APK全屏适配-交接文档 v1》的四层配方：
   ① 系统栏**不藏**（藏了宿主会用黑杠填上，画面反而被切）——只把两栏设透明；
   ② 内容铺到栏下面（decorFitsSystemWindows=false）＋关掉系统强加的对比蒙层；
   ③ **运行时自己量 insets**（判据＝数值 ＋ isVisible 两条腿；横屏强制 top=0——宿主会谎报竖屏
      的 112px）→ 除以 density 换算成 CSS px → 写进页面的 --sa-t/-b/-l/-r（游戏里那四个变量
      本来就是给安全区用的，写 inline 即覆盖 env()）；
   ④ 顶部一条"底色→透明"渐隐（带一段实色 guard，状态栏图标不会压到字），底部一条
      "透明→底色"渐隐贴在手势区上沿——不让系统蒙层的硬边切在画面中间。 */
public class MainActivity extends BridgeActivity {
    private static final int 底色 = 0xFF171C26;      // ＝ 游戏的 --bg0，与 styles.xml 一致
    private static final String 全屏开关键 = "citylife-immersive";   // '1'＝沉浸（藏系统栏）；空/其它＝铺满
    private int 上, 下, 左, 右;
    private View 顶渐隐;
    private int 推过上 = -1, 推过下 = -1, 推过左 = -1, 推过右 = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        边缘到边缘();
        量insets();
        建顶渐隐();
        推值();
        挂全屏开关();
        for (long t : new long[] { 120, 400, 1200, 2500 }) {     // 页面加载完前几次推送会落空，补几拍
            getWindow().getDecorView().postDelayed(this::推值, t);
        }
    }

    @Override
    public void onDestroy() {
        try { if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().removeJavascriptInterface("SZGOShell"); } catch (Throwable ignored) { }
        super.onDestroy();
    }

    /** 第 181 单·全屏开关：页面里的「全屏方式」写 localStorage，也直接叫这里一声（同一台设备，两处都记）。 */
    private void 挂全屏开关() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void setImmersive(final int on) {
                    getWindow().getDecorView().post(() -> 应用沉浸(on == 1));
                }
                @JavascriptInterface
                public int getImmersive() { return 沉浸中 ? 1 : 0; }
            }, "SZGOShell");
            // 开机读一次页面里存的选择（页面还没加载完就再补几拍）
            for (long t : new long[] { 600, 1500, 3000 }) {
                getWindow().getDecorView().postDelayed(this::读页面开关, t);
            }
        } catch (Throwable ignored) { }
    }

    private boolean 沉浸中 = false;

    private void 读页面开关() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                "(function(){try{return localStorage.getItem('" + 全屏开关键 + "')||''}catch(e){return ''}})();",
                v -> 应用沉浸(v != null && v.indexOf("1") >= 0));
        } catch (Throwable ignored) { }
    }

    private void 应用沉浸(boolean on) {
        沉浸中 = on;
        try {
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            if (c == null) return;
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
            }
        } catch (Throwable ignored) { }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // manifest 声明了 configChanges ⇒ 旋转不重建 Activity、系统也不再派发 insets 回调，只能自己补读
        推值();
        getWindow().getDecorView().postDelayed(this::推值, 400);
        getWindow().getDecorView().postDelayed(this::推值, 1200);
    }

    private void 边缘到边缘() {
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {          // 这两行才是"真透明"（不然栏看着透明其实是灰的）
            w.setStatusBarContrastEnforced(false);
            w.setNavigationBarContrastEnforced(false);
        }
        WindowCompat.setDecorFitsSystemWindows(w, false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        if (c != null) {                            // 深底 ⇒ 栏图标用浅色
            c.setAppearanceLightStatusBars(false);
            c.setAppearanceLightNavigationBars(false);
        }
    }

    private void 量insets() {
        WindowInsets ins = null;
        try { ins = getWindow().getDecorView().getRootWindowInsets(); } catch (Throwable ignored) { }
        if (ins == null) { 上 = 下 = 左 = 右 = 0; return; }
        if (Build.VERSION.SDK_INT >= 30) {
            Insets b = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            上 = b.top; 下 = b.bottom; 左 = b.left; 右 = b.right;
            try {
                if (!ins.isVisible(WindowInsets.Type.statusBars())) 上 = 0;        // 两条腿：数值 ＋ 在不在
                if (!ins.isVisible(WindowInsets.Type.navigationBars())) 下 = 0;
            } catch (Throwable ignored) { }
        } else {
            上 = ins.getSystemWindowInsetTop(); 下 = ins.getSystemWindowInsetBottom();
            左 = ins.getSystemWindowInsetLeft(); 右 = ins.getSystemWindowInsetRight();
        }
        if (getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE) {
            上 = 0;                                  // 实测坑：横屏没有状态栏，宿主却仍报竖屏的 112px
        }
    }

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void 推值() {
        量insets();
        float d = getResources().getDisplayMetrics().density;
        int t = Math.round(上 / d), b = Math.round(下 / d), l = Math.round(左 / d), r = Math.round(右 / d);
        if (t != 推过上 || b != 推过下 || l != 推过左 || r != 推过右) {
            推过上 = t; 推过下 = b; 推过左 = l; 推过右 = r;
            final String js = "(function(){var s=document.documentElement.style;"
                + "s.setProperty('--sa-t','" + t + "px');s.setProperty('--sa-b','" + b + "px');"
                + "s.setProperty('--sa-l','" + l + "px');s.setProperty('--sa-r','" + r + "px');})();";
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> {
                        try { getBridge().getWebView().evaluateJavascript(js, null); } catch (Throwable ignored) { }
                    });
                }
            } catch (Throwable ignored) { }
        }
        调渐隐();
    }

    /* 第 181 单：**去掉底部渐隐层**——真机反馈它把底部 UI（页签栏／提示条）糊住了。
       底部那条系统蒙层改走"换深色主题 + 沉浸开关"这条路（见 styles.xml 与页面里的全屏方式）。 */
    private void 建顶渐隐() {
        ViewGroup 根;
        try { 根 = findViewById(android.R.id.content); } catch (Throwable e) { return; }
        if (根 == null) return;
        顶渐隐 = new 渐隐层(true);
        根.addView(顶渐隐, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0,
            android.view.Gravity.TOP));
    }

    private void 调渐隐() {
        if (顶渐隐 != null) {
            int h = 上 > 0 ? 上 : 0;                    // 只盖住状态栏那一条，绝不下探到 UI 上
            ViewGroup.LayoutParams lp = 顶渐隐.getLayoutParams();
            lp.height = h;
            顶渐隐.setLayoutParams(lp);
            顶渐隐.setVisibility(h > 0 ? View.VISIBLE : View.GONE);   // 判据是"栏在不在"，不是横竖屏
            顶渐隐.invalidate();
        }
    }

    /** 纯展示层：不消费触摸（没挂点击监听），点击照常穿到下面的 WebView。 */
    private class 渐隐层 extends View {
        private final boolean 是顶;
        private final Paint 笔 = new Paint(Paint.ANTI_ALIAS_FLAG);

        渐隐层(boolean 是顶) { super(MainActivity.this); this.是顶 = 是顶; }

        @Override
        protected void onSizeChanged(int w, int h, int ow, int oh) {
            super.onSizeChanged(w, h, ow, oh);
            int 实色 = 底色;
            int 透明 = 实色 & 0x00FFFFFF;
            if (是顶) {
                float guard = h > 0 ? Math.min(1f, (float) Math.max(0, 上) / (float) h) : 0f;
                笔.setShader(new LinearGradient(0, 0, 0, h,
                    new int[] { 实色, 实色, 透明 }, new float[] { 0f, guard, 1f }, Shader.TileMode.CLAMP));
            } else {
                笔.setShader(new LinearGradient(0, 0, 0, h,
                    透明, 实色, Shader.TileMode.CLAMP));
            }
        }

        @Override
        protected void onDraw(Canvas c) {
            if (getHeight() > 0) c.drawRect(0, 0, getWidth(), getHeight(), 笔);
        }
    }
}
