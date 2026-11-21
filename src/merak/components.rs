use crate::theme::{self, craft, Theme};
use crate::ui;
use gpui::{prelude::FluentBuilder, *};
use merak_contracts::{
    ArtifactVerdict, BotStatus, ClaimStatus, InboxStatus, ScheduleRunOutcome, TaskStatus,
};

pub fn positive_color() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0x4c, 0xc3, 0x8a, 1.)
    } else {
        theme::rgbaf(0x16, 0xa3, 0x4a, 1.)
    }
}

pub fn attention_color() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xe5, 0x9a, 0x38, 1.)
    } else {
        theme::rgbaf(0xd9, 0x77, 0x06, 1.)
    }
}

pub fn negative_color() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xe5, 0x48, 0x4d, 1.)
    } else {
        theme::rgbaf(0xdc, 0x26, 0x26, 1.)
    }
}

pub fn text_secondary() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xb4, 0xb4, 0xbc, 1.)
    } else {
        theme::rgbaf(0x52, 0x52, 0x57, 1.)
    }
}

pub fn text_muted() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0x98, 0x98, 0xa0, 1.)
    } else {
        theme::rgbaf(0x66, 0x66, 0x6c, 1.)
    }
}

pub fn sidebar_muted() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0xff, 0xff, 0xff, 0.72)
    } else {
        theme::rgbaf(0x14, 0x16, 0x1a, 0.62)
    }
}

pub fn accent_text() -> Hsla {
    if theme::dark() {
        theme::rgbaf(0x6d, 0xae, 0xff, 1.)
    } else {
        theme::rgbaf(0x25, 0x63, 0xeb, 1.)
    }
}

pub fn status_dot(color: Hsla) -> Div {
    div().size(px(6.)).rounded_full().bg(color).flex_none()
}

pub fn sidebar_count(count: usize, emphasize: bool) -> Div {
    div()
        .flex_none()
        .text_size(px(11.5))
        .font_weight(if emphasize { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
        .text_color(if emphasize { accent_text() } else { sidebar_muted() })
        .child(count.to_string())
}

pub fn quiet_count(count: usize, emphasize: bool) -> Div {
    div()
        .flex_none()
        .text_size(px(11.5))
        .font_weight(if emphasize { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
        .text_color(if emphasize { accent_text() } else { text_muted() })
        .child(count.to_string())
}

pub fn subtle_pill(label: impl Into<SharedString>) -> Div {
    div()
        .flex_none()
        .h(px(20.))
        .px(px(7.))
        .rounded(px(5.))
        .bg(theme::ca(craft::N1000, 0.055))
        .flex()
        .items_center()
        .text_size(px(11.))
        .text_color(text_secondary())
        .whitespace_nowrap()
        .child(ui::ui_text(label))
}

pub fn text_tab(id: impl Into<ElementId>, label: impl Into<SharedString>, active: bool) -> Stateful<Div> {
    div()
        .id(id)
        .relative()
        .h(px(34.))
        .px(px(2.))
        .flex()
        .items_center()
        .cursor_pointer()
        .text_size(px(13.))
        .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::NORMAL })
        .text_color(if active { Theme::text() } else { text_secondary() })
        .hover(|s| s.text_color(Theme::text()))
        .child(ui::ui_text(label))
        .when(active, |d| {
            d.child(
                div()
                    .absolute()
                    .bottom_0()
                    .left_0()
                    .right_0()
                    .h(px(2.))
                    .rounded_full()
                    .bg(Theme::text()),
            )
        })
}

pub fn text_filter(id: impl Into<ElementId>, label: impl Into<SharedString>, active: bool) -> Stateful<Div> {
    div()
        .id(id)
        .flex_none()
        .h(px(26.))
        .px(px(9.))
        .rounded(px(7.))
        .flex()
        .items_center()
        .cursor_pointer()
        .text_size(px(12.))
        .font_weight(if active { FontWeight::MEDIUM } else { FontWeight::NORMAL })
        .when(active, |d| {
            d.bg(theme::ca(craft::N1000, 0.075)).text_color(Theme::text())
        })
        .when(!active, |d| {
            d.text_color(text_secondary())
                .hover(|s| s.bg(Theme::fill_hover()).text_color(Theme::text()))
        })
        .child(ui::ui_text(label))
}

pub fn verdict_dot_color(verdict: ArtifactVerdict) -> Hsla {
    match verdict {
        ArtifactVerdict::PendingHuman => attention_color(),
        ArtifactVerdict::Passed | ArtifactVerdict::Settled => positive_color(),
        ArtifactVerdict::Rejected => negative_color(),
    }
}

pub fn claim_dot_color(status: ClaimStatus) -> Hsla {
    match status {
        ClaimStatus::Verified | ClaimStatus::Passed => positive_color(),
        ClaimStatus::PendingHuman => attention_color(),
        ClaimStatus::Failed | ClaimStatus::Rejected => negative_color(),
    }
}

pub fn schedule_dot_color(outcome: ScheduleRunOutcome) -> Hsla {
    match outcome {
        ScheduleRunOutcome::AllGreen => positive_color(),
        ScheduleRunOutcome::HasGaps | ScheduleRunOutcome::NeedsHuman => attention_color(),
        ScheduleRunOutcome::Failed => negative_color(),
    }
}

pub fn task_status_dot_color(status: TaskStatus) -> Hsla {
    match status {
        TaskStatus::Todo => text_muted(),
        TaskStatus::InProgress => Theme::primary(),
        TaskStatus::Waiting => attention_color(),
        TaskStatus::Review => theme::c(craft::O500),
        TaskStatus::Done => positive_color(),
    }
}

pub fn inbox_status_dot_color(status: InboxStatus) -> Hsla {
    match status {
        InboxStatus::Pending => attention_color(),
        InboxStatus::Approved | InboxStatus::Settled => positive_color(),
        InboxStatus::Rejected => negative_color(),
        InboxStatus::Archived => text_muted(),
    }
}

pub fn bot_status_dot_color(status: BotStatus) -> Hsla {
    match status {
        BotStatus::Running => positive_color(),
        BotStatus::WaitingVerdict => attention_color(),
        BotStatus::Idle => text_muted(),
    }
}

/// Clip-slide a fixed-width right drawer smoothly between `0` and `full_width`
/// without reflowing its internal flex layout mid-transition.
pub fn sliding_right_drawer(current_w: f32, full_width: f32, drawer: Div) -> Option<Div> {
    let w = current_w.clamp(0.0, full_width);
    (w > 0.5).then(|| {
        let progress = (w / full_width).clamp(0.0, 1.0);
        div()
            .w(px(w))
            .flex_none()
            .h_full()
            .overflow_hidden()
            .child(drawer.opacity(progress))
    })
}
