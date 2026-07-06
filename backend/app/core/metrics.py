from prometheus_client import Counter, Gauge, Histogram

# Bandwidth usage Counter (in bytes)
PIPELINE_BANDWIDTH = Counter(
    "cicd_pipeline_bandwidth_bytes_total",
    "Total bandwidth consumed by CI/CD pipelines in bytes",
    ["direction", "pipeline_id", "step"]
)

# Active running builds count
ACTIVE_BUILDS = Gauge(
    "cicd_pipeline_active_builds",
    "Number of currently active CI/CD pipelines",
    ["pipeline_id"]
)

# Pipeline duration histogram
PIPELINE_DURATION = Histogram(
    "cicd_pipeline_duration_seconds",
    "Duration of CI/CD pipeline steps in seconds",
    ["pipeline_id", "step"]
)
