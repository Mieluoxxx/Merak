use serde_json::{json, Value};

fn idx(n: usize) -> String {
    const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let a = DIGITS[(n / DIGITS.len()) % DIGITS.len()] as char;
    let b = DIGITS[n % DIGITS.len()] as char;
    format!("a{a}{b}")
}

fn frame_el(id: &str, order: usize, x: f64, y: f64, w: f64, h: f64, name: &str) -> Value {
    json!({
        "id": id,
        "type": "frame",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "angle": 0,
        "strokeColor": "#868e96",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "dashed",
        "roughness": 0,
        "opacity": 100,
        "groupIds": [],
        "frameId": null,
        "index": idx(order),
        "roundness": null,
        "seed": 100 + order as u64,
        "version": 1,
        "versionNonce": 1000 + order as u64,
        "isDeleted": false,
        "boundElements": [],
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "name": name
    })
}

fn push_shape_with_label(
    els: &mut Vec<Value>,
    order: &mut usize,
    shape_type: &str,
    id: &str,
    frame_id: Option<&str>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    stroke: &str,
    fill: &str,
    label: &str,
    extra_arrows: &[&str],
) {
    let tid = format!("{id}_t");
    let mut bound: Vec<Value> = vec![json!({ "id": tid, "type": "text" })];
    for aid in extra_arrows {
        bound.push(json!({ "id": aid, "type": "arrow" }));
    }
    let roundness = if shape_type == "rectangle" {
        json!({ "type": 3 })
    } else {
        json!({ "type": 2 })
    };

    let s_idx = idx(*order);
    *order += 1;
    let t_idx = idx(*order);
    *order += 1;

    els.push(json!({
        "id": id,
        "type": shape_type,
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "angle": 0,
        "strokeColor": stroke,
        "backgroundColor": fill,
        "fillStyle": "hachure",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": frame_id,
        "index": s_idx,
        "roundness": roundness,
        "seed": 200 + *order as u64,
        "version": 2,
        "versionNonce": 2000 + *order as u64,
        "isDeleted": false,
        "boundElements": bound,
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false
    }));

    let line_count = label.lines().count().max(1) as f64;
    let th = line_count * 22.0;
    let tw = (w - 24.0).max(80.0);
    els.push(json!({
        "id": tid,
        "type": "text",
        "x": x + 12.0,
        "y": y + (h - th) * 0.5,
        "width": tw,
        "height": th,
        "angle": 0,
        "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": frame_id,
        "index": t_idx,
        "roundness": null,
        "seed": 300 + *order as u64,
        "version": 2,
        "versionNonce": 3000 + *order as u64,
        "isDeleted": false,
        "boundElements": null,
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "text": label,
        "fontSize": 16,
        "fontFamily": 5,
        "textAlign": "center",
        "verticalAlign": "middle",
        "containerId": id,
        "originalText": label,
        "autoResize": true,
        "lineHeight": 1.25,
        "baseFontSize": null,
        "labelPosition": null
    }));
}

fn push_sticky(
    els: &mut Vec<Value>,
    order: &mut usize,
    id: &str,
    frame_id: Option<&str>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    label: &str,
) {
    let tid = format!("{id}_t");
    let s_idx = idx(*order);
    *order += 1;
    let t_idx = idx(*order);
    *order += 1;

    els.push(json!({
        "id": id,
        "type": "stickynote",
        "x": x,
        "y": y,
        "width": w,
        "height": h,
        "angle": 0,
        "strokeColor": "#1e1e1e",
        "backgroundColor": "#ffec99",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": frame_id,
        "index": s_idx,
        "roundness": { "type": 2 },
        "seed": 400 + *order as u64,
        "version": 2,
        "versionNonce": 4000 + *order as u64,
        "isDeleted": false,
        "boundElements": [{ "id": tid, "type": "text" }],
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "baseHeight": (h - 16.0).max(80.0)
    }));

    els.push(json!({
        "id": tid,
        "type": "text",
        "x": x + 16.0,
        "y": y + 16.0,
        "width": (w - 32.0).max(80.0),
        "height": (h - 32.0).max(40.0),
        "angle": 0,
        "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": frame_id,
        "index": t_idx,
        "roundness": null,
        "seed": 500 + *order as u64,
        "version": 2,
        "versionNonce": 5000 + *order as u64,
        "isDeleted": false,
        "boundElements": null,
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "text": label,
        "fontSize": 15,
        "fontFamily": 5,
        "textAlign": "left",
        "verticalAlign": "top",
        "containerId": id,
        "originalText": label,
        "autoResize": false,
        "lineHeight": 1.3,
        "baseFontSize": 15,
        "labelPosition": null
    }));
}

fn push_arrow(
    els: &mut Vec<Value>,
    order: &mut usize,
    id: &str,
    frame_id: Option<&str>,
    x: f64,
    y: f64,
    dx: f64,
    dy: f64,
    start_id: Option<&str>,
    end_id: Option<&str>,
    stroke: &str,
) {
    let a_idx = idx(*order);
    *order += 1;
    let start_binding = start_id.map(|eid| {
        json!({ "elementId": eid, "fixedPoint": [0.5, 1.0], "mode": "orbit" })
    });
    let end_binding = end_id.map(|eid| {
        json!({ "elementId": eid, "fixedPoint": [0.5, 0.0], "mode": "orbit" })
    });
    els.push(json!({
        "id": id,
        "type": "arrow",
        "x": x,
        "y": y,
        "width": dx.abs().max(1.0),
        "height": dy.abs().max(1.0),
        "angle": 0,
        "strokeColor": stroke,
        "backgroundColor": "transparent",
        "fillStyle": "solid",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "groupIds": [],
        "frameId": frame_id,
        "index": a_idx,
        "roundness": { "type": 2 },
        "seed": 600 + *order as u64,
        "version": 2,
        "versionNonce": 6000 + *order as u64,
        "isDeleted": false,
        "boundElements": [],
        "updated": 1731576000000_i64,
        "created": 1731575000000_i64,
        "link": null,
        "locked": false,
        "points": [[0, 0], [dx, dy]],
        "startBinding": start_binding,
        "endBinding": end_binding,
        "startArrowhead": null,
        "endArrowhead": "triangle",
        "elbowed": false
    }));
}

fn finish_scene(els: Vec<Value>) -> String {
    json!({
        "elements": els,
        "files": {}
    })
    .to_string()
}

/// 1. Merak Core vs App 运行时拓扑决策白板（方案 A vs 方案 B）
pub fn scene_merak_arch_decision() -> String {
    let mut els = Vec::new();
    let mut order = 0;

    // Frame A: Recommended
    els.push(frame_el("fa", order, 40.0, 40.0, 390.0, 468.0, "方案 A · 独立 Tokio Daemon [Bot 推荐]"));
    order += 1;
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "a_gpui",
        Some("fa"),
        70.0,
        75.0,
        330.0,
        76.0,
        "#1971c2",
        "#a5d8ff",
        "Merak GPUI 原生壳\n120fps 渲染 + 决策白板 / 验证视图",
        &["arr_a1"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "a_ipc",
        Some("fa"),
        105.0,
        195.0,
        260.0,
        66.0,
        "#2f9e44",
        "#b2f2bb",
        "merak-contracts RPC\nCommand / Event / Outbox 增量流",
        &["arr_a1", "arr_a2"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "a_daemon",
        Some("fa"),
        70.0,
        305.0,
        330.0,
        82.0,
        "#2f9e44",
        "#d3f9d8",
        "merak-daemon (常驻守护进程)\nTokio + Mizar 31 Crates + Cron 定时",
        &["arr_a2"],
    );
    push_arrow(&mut els, &mut order, "arr_a1", Some("fa"), 235.0, 151.0, 0.0, 44.0, Some("a_gpui"), Some("a_ipc"), "#1971c2");
    push_arrow(&mut els, &mut order, "arr_a2", Some("fa"), 235.0, 261.0, 0.0, 44.0, Some("a_ipc"), Some("a_daemon"), "#2f9e44");
    push_sticky(
        &mut els,
        &mut order,
        "a_note",
        Some("fa"),
        70.0,
        400.0,
        330.0,
        88.0,
        "优点：关闭 GPUI 窗口后\nCron 定时巡检与 Bot 继续保活。",
    );

    // Frame B: Alternative
    els.push(frame_el("fb", order, 470.0, 40.0, 360.0, 468.0, "方案 B · 同进程嵌入 Tokio 线程池"));
    order += 1;
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "b_single",
        Some("fb"),
        500.0,
        75.0,
        300.0,
        130.0,
        "#868e96",
        "#e9ecef",
        "单一 GPUI 进程内\nUI 渲染 + Tokio Worker + SQLite\n直接通过 channel 内存通信",
        &["arr_b1"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "b_risk",
        Some("fb"),
        500.0,
        245.0,
        300.0,
        92.0,
        "#e03131",
        "#ffc9c9",
        "权衡代价：\n⌘Q 退出桌面端后所有 Cron 停止\n无法与外部 CLI 共享守护态",
        &["arr_b1"],
    );
    push_arrow(&mut els, &mut order, "arr_b1", Some("fb"), 650.0, 205.0, 0.0, 40.0, Some("b_single"), Some("b_risk"), "#e03131");
    push_sticky(
        &mut els,
        &mut order,
        "b_note",
        Some("fb"),
        500.0,
        365.0,
        300.0,
        118.0,
        "Arch-Bot 建议选方案 A：\n前期 Mock Shell 可先单进程，\nPhase 1 再无缝切独立 Daemon。",
    );

    finish_scene(els)
}

/// 2. Mizar AgentLoop Suspend/Resume 挂起超时的视觉决策白板
pub fn scene_mizar_suspend_decision() -> String {
    let mut els = Vec::new();
    let mut order = 0;

    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "m_loop",
        None,
        60.0,
        165.0,
        175.0,
        80.0,
        "#1971c2",
        "#a5d8ff",
        "mizar-agent-loop\n触发红线 / 危险工具",
        &["m_arr1"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "m_ckpt",
        None,
        280.0,
        165.0,
        180.0,
        80.0,
        "#1971c2",
        "#d0ebff",
        "SQLite Checkpoint\n推入 Merak Inbox",
        &["m_arr1", "m_arr2"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "diamond",
        "m_dia",
        None,
        505.0,
        145.0,
        165.0,
        120.0,
        "#f08c00",
        "#fff3bf",
        "挂起超过\n24 小时?",
        &["m_arr2", "m_arr3", "m_arr4"],
    );
    push_arrow(&mut els, &mut order, "m_arr1", None, 235.0, 205.0, 45.0, 0.0, Some("m_loop"), Some("m_ckpt"), "#1e1e1e");
    push_arrow(&mut els, &mut order, "m_arr2", None, 460.0, 205.0, 45.0, 0.0, Some("m_ckpt"), Some("m_dia"), "#1e1e1e");

    els.push(frame_el("mf_a", order, 725.0, 35.0, 275.0, 165.0, "策略 A · 安全保活等待 [推荐]"));
    order += 1;
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "m_opt_a",
        Some("mf_a"),
        748.0,
        75.0,
        228.0,
        96.0,
        "#2f9e44",
        "#b2f2bb",
        "永久保持 Checkpoint\n直到人类在 Inbox 拍板\n（零静默丢失现场）",
        &["m_arr3"],
    );

    els.push(frame_el("mf_b", order, 725.0, 235.0, 275.0, 165.0, "策略 B · 超时自动拒绝"));
    order += 1;
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "m_opt_b",
        Some("mf_b"),
        748.0,
        275.0,
        228.0,
        96.0,
        "#e03131",
        "#ffc9c9",
        "24h 后自动 Cancel Tool\n并追加超时 Ruling 通知",
        &["m_arr4"],
    );

    push_arrow(&mut els, &mut order, "m_arr3", None, 670.0, 185.0, 78.0, -62.0, Some("m_dia"), Some("m_opt_a"), "#2f9e44");
    push_arrow(&mut els, &mut order, "m_arr4", None, 670.0, 225.0, 78.0, 98.0, Some("m_dia"), Some("m_opt_b"), "#e03131");

    push_sticky(
        &mut els,
        &mut order,
        "m_note",
        None,
        60.0,
        295.0,
        400.0,
        100.0,
        "Rust-Bot 说明：\n个人工作台经常过夜才看 Inbox，若超时自毁会打断长时间巡检上下文。",
    );

    finish_scene(els)
}

/// 3. 定时任务（Schedules）静默降噪与 Verify Report 漏斗流程图
pub fn scene_schedule_funnel() -> String {
    let mut els = Vec::new();
    let mut order = 0;

    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "s_trig",
        None,
        50.0,
        155.0,
        180.0,
        85.0,
        "#1971c2",
        "#a5d8ff",
        "Cron / Watcher\n定时或监听触发",
        &["s_a1"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "s_run",
        None,
        275.0,
        155.0,
        195.0,
        85.0,
        "#1971c2",
        "#d0ebff",
        "沙箱自动执行\ncargo test / shot 截帧",
        &["s_a1", "s_a2"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "s_rep",
        None,
        515.0,
        155.0,
        190.0,
        85.0,
        "#7048e8",
        "#e5dbff",
        "生成 Verify Report\nClaims + Not Verified Gap",
        &["s_a2", "s_a3"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "diamond",
        "s_chk",
        None,
        750.0,
        138.0,
        155.0,
        120.0,
        "#f08c00",
        "#fff3bf",
        "全绿通过\n且无 Gap?",
        &["s_a3", "s_a4", "s_a5"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "s_ok",
        None,
        960.0,
        55.0,
        220.0,
        82.0,
        "#2f9e44",
        "#b2f2bb",
        "静默归档绿灯历史\n不打扰 Inbox（零噪音）",
        &["s_a4"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "s_warn",
        None,
        960.0,
        255.0,
        220.0,
        95.0,
        "#e03131",
        "#ffc9c9",
        "推送 Verify 卡进 Inbox\n一键 Waive 豁免或转 Task",
        &["s_a5"],
    );

    push_arrow(&mut els, &mut order, "s_a1", None, 230.0, 197.0, 45.0, 0.0, Some("s_trig"), Some("s_run"), "#1971c2");
    push_arrow(&mut els, &mut order, "s_a2", None, 470.0, 197.0, 45.0, 0.0, Some("s_run"), Some("s_rep"), "#7048e8");
    push_arrow(&mut els, &mut order, "s_a3", None, 705.0, 197.0, 45.0, 0.0, Some("s_rep"), Some("s_chk"), "#f08c00");
    push_arrow(&mut els, &mut order, "s_a4", None, 905.0, 175.0, 55.0, -78.0, Some("s_chk"), Some("s_ok"), "#2f9e44");
    push_arrow(&mut els, &mut order, "s_a5", None, 905.0, 222.0, 55.0, 80.0, Some("s_chk"), Some("s_warn"), "#e03131");

    push_sticky(
        &mut els,
        &mut order,
        "s_note",
        None,
        50.0,
        285.0,
        420.0,
        95.0,
        "Ryugi × Merak 约定：\n只有「需要人类裁决（失败 / 未覆盖 Gap / 显式晨报）」才允许进入 Inbox。",
    );

    finish_scene(els)
}

/// 4. Visual Workbench & Project 产物全景架构图
pub fn scene_visual_workbench_map() -> String {
    let mut els = Vec::new();
    let mut order = 0;

    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "v_proj",
        None,
        310.0,
        45.0,
        290.0,
        84.0,
        "#1971c2",
        "#a5d8ff",
        "Project 一等工作区容器\n绑定代码仓 / Skills / Bots",
        &["v_a1", "v_a2", "v_a3", "v_a4"],
    );

    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "v_canvas",
        None,
        50.0,
        205.0,
        200.0,
        95.0,
        "#2f9e44",
        "#b2f2bb",
        "Decision Canvas\n方案画图选型\n拒绝纯聊天壁",
        &["v_a1"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "v_verify",
        None,
        280.0,
        205.0,
        200.0,
        95.0,
        "#7048e8",
        "#e5dbff",
        "Verify Report\n机器自证 Claims +\nNot Verified Gaps",
        &["v_a2"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "v_tasks",
        None,
        510.0,
        205.0,
        200.0,
        95.0,
        "#f08c00",
        "#fff3bf",
        "Tasks & Rulings\nSpec 切片任务 +\nBot 自主裁决账本",
        &["v_a3"],
    );
    push_shape_with_label(
        &mut els,
        &mut order,
        "rectangle",
        "v_cron",
        None,
        740.0,
        205.0,
        200.0,
        95.0,
        "#1098ad",
        "#c5f6fa",
        "Schedules 定时任务\nCron / Watcher\n绿灯静默巡检",
        &["v_a4"],
    );

    push_arrow(&mut els, &mut order, "v_a1", None, 375.0, 129.0, -225.0, 76.0, Some("v_proj"), Some("v_canvas"), "#2f9e44");
    push_arrow(&mut els, &mut order, "v_a2", None, 425.0, 129.0, -45.0, 76.0, Some("v_proj"), Some("v_verify"), "#7048e8");
    push_arrow(&mut els, &mut order, "v_a3", None, 485.0, 129.0, 125.0, 76.0, Some("v_proj"), Some("v_tasks"), "#f08c00");
    push_arrow(&mut els, &mut order, "v_a4", None, 545.0, 129.0, 295.0, 76.0, Some("v_proj"), Some("v_cron"), "#1098ad");

    push_sticky(
        &mut els,
        &mut order,
        "v_note",
        None,
        260.0,
        345.0,
        420.0,
        88.0,
        "Inbox = 全局人类裁决总闸：\n任何需要拍板、Pass/Reject、豁免 Gap 或审批红线的产物自动浮上 Inbox。",
    );

    finish_scene(els)
}
