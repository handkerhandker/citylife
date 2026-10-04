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
    private boolean 上为兜底 = false;                    // 第 190 单：上值是否来自系统声明高度（宿主不报数时）
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
        for (long t : new long[] { 120, 400, 1200, 2500, 5000, 8000 }) {   // 页面加载完前几次推送会落空，补几拍（第 190 单补到 8 秒——鸿蒙冷启动慢）
            getWindow().getDecorView().postDelayed(this::推值, t);
        }
    }

    /* 第 190 单·窗口拿到焦点时再推一次：首次显示/回到前台往往正是页面刚加载完的那一刻，
       比固定补拍更准；推值() 只在值变化时才写页面，重复调用无害。 */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) 推值();
    }

    @Override
    public void onDestroy() {
        try { if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().removeJavascriptInterface("SZGOShell"); } catch (Throwable ignored) { }
        super.onDestroy();
    }

    /* 第 183 单·返回键：先问页面"这一按你能消化吗"（关弹窗／回现场页），
       页面说消化不了才真退 App —— 与页面里 Input.back 的次序同一套，不另立判据。
       真机提醒（交接文档 §5.4）：卓易通里"边缘返回退游戏"要单独试，别无条件吞返回。 */
    @Override
    public void onBackPressed() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{return (window.__back&&window.__back())?'1':'0'}catch(e){return '0'}})();",
                    v -> { if (v == null || v.indexOf("1") < 0) 真退出(); });
                return;
            }
        } catch (Throwable ignored) { }
        super.onBackPressed();
    }

    private void 真退出() { super.onBackPressed(); }

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
                /* 第 190 单·安全区投递"第二条腿"：页面主动来问。
                   返回 CSS px 的 "上,下,左,右"（除过 density；横屏 top 已按实测坑强制 0）。
                   主线程时顺手现量一次；JS 桥线程调用时返回最近一次量的缓存值（页面会重试几拍）。 */
                @JavascriptInterface
                public String getInsets() {
                    try {
                        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) 量insets();
                        float d = getResources().getDisplayMetrics().density;
                        return Math.round(上 / d) + "," + Math.round(下 / d) + ","
                             + Math.round(左 / d) + "," + Math.round(右 / d) + "," + (上为兜底 ? 1 : 0);
                    } catch (Throwable ignored) {
                        return "";
                    }
                }
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
        上为兜底 = false;
        WindowInsets ins = null;
        try { ins = getWindow().getDecorView().getRootWindowInsets(); } catch (Throwable ignored) { }
        if (ins == null) { 上 = 下 = 左 = 右 = 0; return; }
        if (Build.VERSION.SDK_INT >= 30) {
            Insets b = ins.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            上 = b.top; 下 = b.bottom; 左 = b.left; 右 = b.right;
            /* 第 186 单·顶部的"在不在"那一腿**在卓易通上会误伤**：宿主的状态栏不是安卓系统画的那条，
               系统报"不可见"，按两条腿判就会把 top 清成 0 ⇒ 页面不内缩、顶栏钻到状态栏底下（真机实证）。
               故：顶部只认数值 ＋ 下面那条"横屏强制 0"（交接文档 §4-⑧ 那个假值场景由它兜住）；
               底部保留两条腿（手势条不在时不该白留一截）。 */
            try {
                if (!ins.isVisible(WindowInsets.Type.navigationBars())) 下 = 0;
            } catch (Throwable ignored) { }
        } else {
            上 = ins.getSystemWindowInsetTop(); 下 = ins.getSystemWindowInsetBottom();
            左 = ins.getSystemWindowInsetLeft(); 右 = ins.getSystemWindowInsetRight();
        }
        if (getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE) {
            上 = 0;                                  // 实测坑：横屏没有状态栏，宿主却仍报竖屏的 112px
        } else if (上 <= 0) {
            /* 第 190 单·兜底：宿主（卓易通/鸿蒙容器）压根不报上值时，用系统声明的状态栏高度——
               否则顶栏一直钻在状态栏底下（真机复现）。只在竖屏兜，横屏上面已强制 0。 */
            上 = 取系统尺寸("status_bar_height");
            上为兜底 = 上 > 0;
        }
    }

    /** 读系统声明的尺寸（如 status_bar_height）；读不到返回 0。 */
    private int 取系统尺寸(String 名) {
        try {
            int id = getResources().getIdentifier(名, "dimen", "android");
            if (id > 0) return getResources().getDimensionPixelSize(id);
        } catch (Throwable ignored) { }
        return 0;
    }

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void 推值() {
        量insets();
        float d = getResources().getDisplayMetrics().density;
        int t = Math.round(上 / d), b = Math.round(下 / d), l = Math.round(左 / d), r = Math.round(右 / d);
        if (t != 推过上 || b != 推过下 || l != 推过左 || r != 推过右) {
            推过上 = t; 推过下 = b; 推过左 = l; 推过右 = r;
            /* 第 186 单·照 Capacitor 官方口径：平台（SystemBars, insetsHandling='css'）会把正确值注入成
               `--safe-area-inset-*`，页面 CSS 先读它、再回落 env()。**壳只做兜底**——
               平台变量某一轴缺失时才补 `--sa-*`（不跟平台抢，免得两套值打架）。
               出处：https://capacitorjs.com/docs/apis/system-bars */
            final String js = "(function(){var s=document.documentElement.style;"
                + "var cs=getComputedStyle(document.documentElement);"
                + "function 缺(k){var v=cs.getPropertyValue(k);return !v||!v.trim()||v.trim()==='0px';}"
                + "if(缺('--safe-area-inset-top'))s.setProperty('--sa-t','" + t + "px');"
                + "if(缺('--safe-area-inset-bottom'))s.setProperty('--sa-b','" + b + "px');"
                + "if(缺('--safe-area-inset-left'))s.setProperty('--sa-l','" + l + "px');"
                + "if(缺('--safe-area-inset-right'))s.setProperty('--sa-r','" + r + "px');})();";
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
