use chrono::{DateTime, FixedOffset, Local};

/// 当前时刻。开发版可读 `SHIXU_FAKE_NOW`（RFC 3339）；发布版忽略该变量。
pub fn current_now() -> DateTime<FixedOffset> {
    #[cfg(debug_assertions)]
    {
        if let Ok(raw) = std::env::var("SHIXU_FAKE_NOW")
            && let Ok(parsed) = DateTime::parse_from_rfc3339(&raw)
        {
            return parsed;
        }
    }
    let local = Local::now();
    local.with_timezone(local.offset())
}
