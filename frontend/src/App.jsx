import { useEffect, useRef, useState } from "react";
import "./index.css";

const API_URL = "https://shieldx-api-dngk.onrender.com/upload";

const fieldDefinitions = [
  { key: "license_no", label: "LICENSE NUMBER" },
  { key: "marketed_by", label: "MARKETED BY" },
  { key: "mrp", label: "MRP" },
  { key: "net_weight", label: "NET WEIGHT" },
  { key: "batch_no", label: "BATCH NUMBER" },
  { key: "pkd", label: "PACKED DATE" },
  { key: "use_by", label: "USE BY / EXPIRY" },
];

function statusClass(status) {
  if (!status) return "";

  const normalized = status
    .toLowerCase()
    .replace(/\s+/g, "-");

  if (normalized === "pass") return "pass";
  if (
    normalized === "review" ||
    normalized === "needs-review"
  ) {
    return "review";
  }
  if (normalized === "failed") return "failed";
  if (normalized === "not-detected") return "not-detected";

  return "";
}

function PipelineStep({
  number,
  label,
  active,
  complete,
}) {
  return (
    <div
      className={`pipeline-step ${
        active ? "active" : ""
      } ${complete ? "complete" : ""}`}
    >
      <div className="pipeline-step-number">
        {complete ? "✓" : number}
      </div>

      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>

      <div className="metric-label">
        {label}
      </div>

      {detail && (
        <div className="metric-detail">
          {detail}
        </div>
      )}
    </div>
  );
}

function ArchitectureCard({
  number,
  title,
  text,
}) {
  return (
    <div className="architecture-card">
      <div className="architecture-number">
        {number}
      </div>

      <h3>{title}</h3>

      <p>{text}</p>
    </div>
  );
}

export default function App() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [fields, setFields] = useState({});
  const [compliance, setCompliance] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef(null);
  const scanTimer = useRef(null);

  // ==========================================================
  // LOAD FILE
  // ==========================================================

  const loadFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("PLEASE SELECT A VALID IMAGE FILE.");
      return;
    }

    setError("");
    setImage(file);

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    setOcrText("");
    setFields({});
    setCompliance(null);
    setAnalysisStep(1);
  };

  // ==========================================================
  // FILE CHANGE
  // ==========================================================

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      loadFile(file);
    }
  };

  // ==========================================================
  // DRAG AND DROP
  // ==========================================================

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      loadFile(file);
    }
  };

  // ==========================================================
  // REMOVE IMAGE
  // ==========================================================

  const removeImage = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImage(null);
    setPreview("");
    setOcrText("");
    setFields({});
    setCompliance(null);
    setAnalysisStep(0);
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ==========================================================
  // CLEAN OBJECT URL
  // ==========================================================

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  // ==========================================================
  // ANALYSIS PIPELINE ANIMATION
  // ==========================================================

  useEffect(() => {
    if (!loading) return;

    setAnalysisStep(1);

    const timers = [
      setTimeout(() => {
        setAnalysisStep(2);
      }, 800),

      setTimeout(() => {
        setAnalysisStep(3);
      }, 1800),

      setTimeout(() => {
        setAnalysisStep(4);
      }, 2800),
    ];

    return () => {
      timers.forEach((timer) => clearTimeout(timer));

      if (scanTimer.current) {
        clearTimeout(scanTimer.current);
      }
    };
  }, [loading]);

  // ==========================================================
  // ANALYZE PRODUCT
  // ==========================================================

  const analyzeProduct = async () => {
    if (!image) {
      setError("PLEASE UPLOAD A PRODUCT LABEL FIRST.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysisStep(1);

    try {
      const formData = new FormData();

      formData.append("file", image);

      console.log("=================================");
      console.log("SHIELDX ANALYSIS STARTED");
      console.log("API:", API_URL);
      console.log("FILE:", image.name);
      console.log("TYPE:", image.type);
      console.log("SIZE:", image.size);
      console.log("=================================");

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      console.log(
        "SHIELDX SERVER STATUS:",
        response.status
      );

      const contentType =
        response.headers.get("content-type") || "";

      // ======================================================
      // SERVER ERROR
      // ======================================================

      if (!response.ok) {
        let message = `SERVER ERROR ${response.status}`;

        if (
          contentType.includes("application/json")
        ) {
          const errorData = await response.json();

          message =
            errorData.detail ||
            errorData.message ||
            message;
        } else {
          const text = await response.text();

          if (text) {
            message += ` — ${text.slice(0, 300)}`;
          }
        }

        throw new Error(message);
      }

      // ======================================================
      // INVALID RESPONSE
      // ======================================================

      if (
        !contentType.includes("application/json")
      ) {
        throw new Error(
          "ANALYSIS ENGINE RETURNED AN INVALID RESPONSE."
        );
      }

      // ======================================================
      // READ RESPONSE
      // ======================================================

      const data = await response.json();

      console.log(
        "SHIELDX API RESPONSE:",
        data
      );

      // ======================================================
      // SAVE RESPONSE
      // ======================================================

      setOcrText(
        data.extracted_text || ""
      );

      setFields(
        data.fields || {}
      );

      setCompliance(
        data.compliance?.summary || null
      );

      setAnalysisStep(4);

      // ======================================================
      // SCROLL TO REPORT
      // ======================================================

      setTimeout(() => {
        document
          .getElementById("results")
          ?.scrollIntoView({
            behavior: "smooth",
          });
      }, 500);

    } catch (err) {
      console.error(
        "SHIELDX ANALYSIS ERROR:",
        err
      );

      let message =
        err?.message ||
        "ANALYSIS FAILED. PLEASE TRY AGAIN.";

      // Friendly browser connection message
      if (
        err?.name === "TypeError" &&
        message.toLowerCase().includes("fetch")
      ) {
        message =
          "UNABLE TO CONNECT TO SHIELDX BACKEND. MAKE SURE THE FASTAPI SERVER IS RUNNING ON PORT 8000.";
      }

      setError(message);
      setAnalysisStep(0);

    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // COMPLIANCE DATA
  // ==========================================================

  const coverage =
    compliance?.verification_coverage ?? 0;

  const totalChecks =
    compliance?.total_checks ?? 7;

  const passed =
    compliance?.passed ?? 0;

  const review =
    compliance?.needs_review ?? 0;

  const failed =
    compliance?.failed ?? 0;

  const notDetected =
    compliance?.not_detected ?? 0;

  const overallStatus =
    compliance?.status ||
    "AWAITING ANALYSIS";

  const overallClass =
    statusClass(overallStatus);

  const checks =
    compliance?.checks || [];

  const circumference =
    2 * Math.PI * 76;

  const progressOffset =
    circumference -
    (coverage / 100) *
      circumference;

  return (
    <main className="shieldx">

      {/* ======================================================
          TOP NAVIGATION
      ====================================================== */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-symbol">
            <span />
            <span />
            <span />
          </div>

          <div>
            <div className="brand-name">
              SHIELD<span>X</span>
            </div>

            <div className="brand-subtitle">
              COMPLIANCE INTELLIGENCE
            </div>
          </div>

        </div>

        <nav className="navigation">

          <a href="#home">
            HOME
          </a>

          <a href="#scanner">
            SCANNER
          </a>

          <a href="#how-it-works">
            HOW IT WORKS
          </a>

        </nav>

        <div className="system-indicator">

          <span className="system-dot" />

          SYSTEM ONLINE

        </div>

      </header>


      {/* ======================================================
          HERO
      ====================================================== */}

      <section
        id="home"
        className="hero-section"
      >

        <div className="hero-grid">

          <div className="hero-left">

            <div className="system-tag">

              <span />

              AI-POWERED LABEL INSPECTION

            </div>

            <h1>

              SEE WHAT
              <br />

              THE LABEL
              <br />

              <span>HIDES.</span>

            </h1>

            <p className="hero-description">

              ShieldX transforms product labels
              into structured compliance
              intelligence using OCR-powered
              inspection and automated
              verification.

            </p>

            <div className="hero-buttons">

              <a
                href="#scanner"
                className="primary-button"
              >

                START INSPECTION

                <span>→</span>

              </a>

              <a
                href="#how-it-works"
                className="secondary-button"
              >

                HOW IT WORKS

              </a>

            </div>

            <div className="hero-stats">

              <div>
                <strong>07</strong>
                <span>CHECKPOINTS</span>
              </div>

              <div>
                <strong>OCR</strong>
                <span>EXTRACTION</span>
              </div>

              <div>
                <strong>AI</strong>
                <span>VERIFICATION</span>
              </div>

            </div>

          </div>


          <div className="hero-right">

            <div className="scanner-console">

              <div className="console-top">

                <span>
                  LIVE SCANNER
                </span>

                <span className="console-live">
                  ● ACTIVE
                </span>

              </div>

              <div className="console-body">

                <div className="scan-grid" />

                <div className="radar-circle">
                  <div className="radar-sweep" />
                </div>

                <div className="package-mockup">

                  <div className="package-label">

                    <small>
                      PRODUCT LABEL
                    </small>

                    <strong>
                      SCAN TARGET
                    </strong>

                    <div className="fake-line" />
                    <div className="fake-line short" />
                    <div className="fake-line" />

                    <div className="fake-license">
                      LIC. NO. XXXXXXXX
                    </div>

                    <div className="fake-mrp">
                      MRP ₹XX
                    </div>

                  </div>

                </div>

                <div className="scanner-line" />

                <div className="crosshair">

                  <span />
                  <span />
                  <span />
                  <span />

                </div>

                <div className="detection-box box-one">
                  <span>
                    LICENSE
                  </span>
                </div>

                <div className="detection-box box-two">
                  <span>
                    MRP
                  </span>
                </div>

                <div className="detection-box box-three">
                  <span>
                    NET QTY
                  </span>
                </div>

              </div>

              <div className="console-bottom">

                <span>
                  OPTICAL DETECTION
                </span>

                <span>
                  97.4%
                </span>

              </div>

            </div>

          </div>

        </div>

        <div className="hero-footer">

          <span>
            SHIELDX / 01
          </span>

          <span>
            INSPECT • EXTRACT • VERIFY
          </span>

          <span>
            SCROLL TO INSPECT ↓
          </span>

        </div>

      </section>


      {/* ======================================================
          INSPECTION
      ====================================================== */}

      <section
        id="scanner"
        className="inspection-section"
      >

        <div className="section-container">

          <div className="section-header">

            <div>

              <div className="section-index">
                01 / SCANNER
              </div>

              <div className="section-kicker">
                PRODUCT LABEL INSPECTION
              </div>

            </div>

            <p>

              Upload a product label and let
              ShieldX extract, structure and
              evaluate its compliance information.

            </p>

          </div>


          <div className="inspection-console">

            <div className="console-heading">

              <div>

                <span className="console-heading-label">
                  INSPECTION CONSOLE
                </span>

                <h2>

                  {image
                    ? "LABEL LOADED"
                    : "UPLOAD LABEL"}

                </h2>

              </div>

              <div className="console-id">
                SX / OCR-01
              </div>

            </div>


            {!image ? (

              <div
                className={`upload-interface ${
                  dragging ? "dragging" : ""
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() =>
                  setDragging(false)
                }
                onDrop={handleDrop}
                onClick={() =>
                  fileInputRef.current?.click()
                }
              >

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  hidden
                />

                <div className="upload-target">

                  <div className="target-corner top-left" />
                  <div className="target-corner top-right" />
                  <div className="target-corner bottom-left" />
                  <div className="target-corner bottom-right" />

                  <div className="upload-cross">

                    <span />
                    <span />

                  </div>

                  <div className="upload-content">

                    <span className="upload-icon">
                      +
                    </span>

                                        <h3>
                      DROP PRODUCT LABEL
                    </h3>

                    <p>
                      OR CLICK TO BROWSE
                    </p>

                    <p style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "8px" }}>
                      For best results: use a flat, well-lit, straight-on photo with no glare.
                    </p>

<p style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "8px" }}>
  For best results: use a flat, well-lit, straight-on photo with no glare.
</p>

                  </div>

                </div>

                <div className="upload-footer">

                  <span>
                    SUPPORTED: JPG / PNG / WEBP
                  </span>

                  <span>
                    MAX 10MB
                  </span>

                </div>

              </div>

            ) : (

              <div className="loaded-interface">

                <div className="image-stage">

                  <div className="image-stage-header">

                    <span>
                      INPUT IMAGE
                    </span>

                    <button
                      type="button"
                      onClick={removeImage}
                    >
                      REMOVE ×
                    </button>

                  </div>

                  <div className="image-wrapper">

                    <img
                      src={preview}
                      alt="Uploaded product label"
                    />

                    <div className="image-corner top-left" />
                    <div className="image-corner top-right" />
                    <div className="image-corner bottom-left" />
                    <div className="image-corner bottom-right" />

                    {loading && (
                      <div className="image-scan-line" />
                    )}

                  </div>

                  <div className="image-stage-footer">

                    <span>
                      {image.name}
                    </span>

                    <span>

                      {(
                        image.size /
                        1024 /
                        1024
                      ).toFixed(2)}{" "}
                      MB

                    </span>

                  </div>

                </div>


                <div className="pipeline-panel">

                  <div className="pipeline-status">

                    <span
                      className={
                        loading
                          ? "status-active"
                          : "status-ready"
                      }
                    />

                    {loading
                      ? "ANALYSIS IN PROGRESS"
                      : "READY FOR ANALYSIS"}

                  </div>

                  <h3>

                    INSPECTION
                    <br />
                    PIPELINE

                  </h3>

                  <p>

                    Multi-stage OCR extraction
                    and compliance verification.

                  </p>


                  <div className="pipeline">

                    <PipelineStep
                      number="01"
                      label="IMAGE"
                      active={
                        analysisStep === 1
                      }
                      complete={
                        analysisStep > 1
                      }
                    />

                    <PipelineStep
                      number="02"
                      label="OCR"
                      active={
                        analysisStep === 2
                      }
                      complete={
                        analysisStep > 2
                      }
                    />

                    <PipelineStep
                      number="03"
                      label="EXTRACT"
                      active={
                        analysisStep === 3
                      }
                      complete={
                        analysisStep > 3
                      }
                    />

                    <PipelineStep
                      number="04"
                      label="VERIFY"
                      active={
                        analysisStep === 4
                      }
                      complete={
                        analysisStep > 4
                      }
                    />

                  </div>


                  <div className="inspection-actions">

                    <button
                      className="primary-button"
                      type="button"
                      onClick={analyzeProduct}
                      disabled={loading}
                    >

                      {loading
                        ? "ANALYZING..."
                        : "ANALYZE PRODUCT"}

                      <span>→</span>

                    </button>

                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                    >

                      CHANGE IMAGE

                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      hidden
                    />

                  </div>

                </div>

              </div>

            )}


            {error && (

              <div className="error-box">

                <strong>
                  ANALYSIS ERROR
                </strong>

                <span>
                  {error}
                </span>

              </div>

            )}

          </div>

        </div>

      </section>


      {/* ======================================================
          RESULTS
      ====================================================== */}

      <section
        id="results"
        className="results-section"
      >

        <div className="section-container">

          <div className="report-heading">

            <div>

              <div className="section-index">
                02 / REPORT
              </div>

              <div className="section-kicker">
                COMPLIANCE ANALYSIS
              </div>

              <h2>

                INSPECTION
                <br />
                RESULTS

              </h2>

            </div>

            <div className="report-number">

              SX

              <span>
                REPORT
              </span>

            </div>

          </div>


          {/* VERDICT */}

          <div className="verdict-panel">

            <div
              className={`verdict-icon ${overallClass}`}
            >

              {overallStatus === "PASS"
                ? "✓"
                : overallStatus === "FAILED"
                ? "!"
                : "?"}

            </div>

            <div className="verdict-main">

              <span>
                OVERALL VERDICT
              </span>

              <h3>
                {overallStatus}
              </h3>

            </div>

            <div className="verdict-meta">

              <span>

                {compliance
                  ? "PRELIMINARY AI-ASSISTED INSPECTION"
                  : "AWAITING ANALYSIS"}

              </span>

              <strong>

                {compliance
                  ? `${compliance.evaluated_fields || 0}/${totalChecks} FIELDS VERIFIED`
                  : "NO REPORT GENERATED"}

              </strong>

            </div>

          </div>


          {/* METRICS */}

          <div className="metrics-layout">

            <div className="coverage-panel">

              <div className="block-heading">

                <span>
                  01
                </span>

                VERIFICATION COVERAGE

              </div>

              <div className="coverage-ring">

                <svg
                  viewBox="0 0 180 180"
                  aria-label={`Verification coverage ${coverage}%`}
                >

                  <circle
                    className="ring-background"
                    cx="90"
                    cy="90"
                    r="76"
                  />

                  <circle
                    className="ring-progress"
                    cx="90"
                    cy="90"
                    r="76"
                    strokeDasharray={circumference}
                    strokeDashoffset={progressOffset}
                  />

                </svg>

                <div className="coverage-label">

                  <strong>
                    {coverage}%
                  </strong>

                  <span>
                    COVERAGE
                  </span>

                </div>

              </div>

            </div>


            <div className="metric-grid">

              <Metric
                label="PASSED"
                value={passed}
                detail="VERIFIED"
              />

              <Metric
                label="NEEDS REVIEW"
                value={review}
                detail="HUMAN CHECK"
              />

              <Metric
                label="FAILED"
                value={failed}
                detail="RULE VIOLATION"
              />

              <Metric
                label="NOT DETECTED"
                value={notDetected}
                detail="NO RELIABLE DATA"
              />

            </div>

          </div>


          {/* NOTICE */}

          <div className="report-notice">

            Verification coverage indicates how
            many required fields were detected from
            the uploaded image. A detected field is
            not automatically proof of legal
            compliance. Final regulatory determination
            requires human verification.

          </div>


          {/* ====================================================
              EXTRACTED INFORMATION
          ==================================================== */}

          <div className="report-block">

            <div className="block-heading">

              <span>
                02
              </span>

              EXTRACTED INFORMATION

            </div>

            <h2>
              PRODUCT INFORMATION
            </h2>

            <div className="field-table">

              {fieldDefinitions.map(
                (definition, index) => {

                  const field =
                    fields?.[definition.key];

                  const value =
                    field?.value;

                  const confidence =
                    field?.confidence ?? 0;

                  // IMPORTANT:
                  // Match the exact key returned
                  // by the FastAPI backend.

                  const check =
                    checks.find(
                      (item) =>
                        item.key ===
                        definition.key
                    );

                  let status;

                  if (check?.status) {
                    status = check.status;
                  } else if (value) {
                    status =
                      confidence >= 0.8
                        ? "PASS"
                        : "REVIEW";
                  } else {
                    status = "NOT DETECTED";
                  }

                  return (
                    <div
                      className="field-row"
                      key={definition.key}
                    >

                      <div className="field-number">

                        {String(index + 1).padStart(
                          2,
                          "0"
                        )}

                      </div>

                      <div className="field-label">

                        {definition.label}

                      </div>

                      <div className="field-value">

                        {value || "—"}

                      </div>

                      <div className="field-confidence">

                        {value
                          ? `${Math.round(
                              confidence * 100
                            )}%`
                          : "—"}

                      </div>

                      <div>

                        <span
                          className={`status-pill ${statusClass(
                            status
                          )}`}
                        >
                          {status}
                        </span>

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          </div>


          {/* ====================================================
              COMPLIANCE CHECKS
          ==================================================== */}

          <div className="report-block">

            <div className="block-heading">

              <span>
                03
              </span>

              COMPLIANCE CHECKS

            </div>

            <h2>
              VERIFICATION MATRIX
            </h2>

            <div className="checks-list">

              {checks.length > 0 ? (

                checks.map(
                  (check, index) => (

                    <div
                      className="compliance-row"
                      key={`${
                        check.key ||
                        check.field
                      }-${index}`}
                    >

                      <div className="compliance-number">

                        {String(index + 1).padStart(
                          2,
                          "0"
                        )}

                      </div>

                      <div className="compliance-field">

                        <strong>
                          {check.field}
                        </strong>

                        <span>

                          {check.value ||
                            "No reliable value detected"}

                        </span>

                      </div>

                      <div className="compliance-reason">

                        {check.reason ||
                          check.rule ||
                          "Manual verification required."}

                      </div>

                      <span
                        className={`status-pill ${statusClass(
                          check.status
                        )}`}
                      >

                        {check.status}

                      </span>

                    </div>

                  )

                )

              ) : (

                <div className="compliance-row">

                  <div className="compliance-number">
                    —
                  </div>

                  <div className="compliance-field">

                    <strong>
                      NO ANALYSIS AVAILABLE
                    </strong>

                    <span>
                      Upload and analyze a
                      product label.
                    </span>

                  </div>

                </div>

              )}

            </div>

          </div>


          {/* ====================================================
              RAW OCR
          ==================================================== */}

          <div className="report-block">

            <div className="block-heading">

              <span>
                04
              </span>

              RAW OCR OUTPUT

            </div>

            <h2>
              EXTRACTED TEXT
            </h2>

            <div className="ocr-block">

              <pre>

                {ocrText ||
                  "NO OCR OUTPUT AVAILABLE. RUN AN ANALYSIS TO VIEW RAW EXTRACTED TEXT."}

              </pre>

            </div>

          </div>


          {/* ====================================================
              HUMAN REVIEW
          ==================================================== */}

          <div className="human-review-panel">

            <div className="verdict-icon">
              !
            </div>

            <div>

              <span>
                HUMAN VERIFICATION REQUIRED
              </span>

              <p>

                ShieldX provides AI-assisted
                inspection and should not be
                treated as a final legal or
                regulatory determination. Review
                extracted values against the
                physical label and applicable
                regulations before making a
                compliance decision.

              </p>

            </div>

          </div>

        </div>

      </section>


      {/* ======================================================
          HOW IT WORKS
      ====================================================== */}

      <section
        id="how-it-works"
        className="system-section"
      >

        <div className="section-container">

          <div className="system-heading">

            <div>

              <div className="section-index">
                03 / SYSTEM
              </div>

              <div className="section-kicker">
                HOW SHIELDX WORKS
              </div>

              <h2>

                FROM LABEL
                <br />
                TO INTELLIGENCE.

              </h2>

            </div>

            <p>

              A focused inspection pipeline
              designed to turn unstructured
              product-label information into
              actionable compliance signals.

            </p>

          </div>


          <div className="architecture">

            <ArchitectureCard
              number="01"
              title="CAPTURE"
              text="Upload a clear product-label image. ShieldX prepares the visual input for automated inspection."
            />

            <ArchitectureCard
              number="02"
              title="EXTRACT"
              text="OCR identifies text across multiple image-processing passes to recover important label information."
            />

            <ArchitectureCard
              number="03"
              title="STRUCTURE"
              text="Detected information is organized into compliance-relevant fields such as license, MRP and quantity."
            />

            <ArchitectureCard
              number="04"
              title="VERIFY"
              text="Each detected field is evaluated for confidence and rule-level verification status."
            />

          </div>


          <div className="capability-strip">

            <span>
              OCR ENGINE
            </span>

            <span>
              FIELD EXTRACTION
            </span>

            <span>
              CONFIDENCE SCORING
            </span>

            <span>
              RULE VALIDATION
            </span>

            <span>
              HUMAN REVIEW
            </span>

          </div>

        </div>

      </section>


      {/* ======================================================
          FOOTER
      ====================================================== */}

      <footer className="footer">

        <div className="footer-container">

          <div className="footer-brand">

            <div className="brand-symbol">

              <span />
              <span />
              <span />

            </div>

            <div>

              <div className="brand-name">
                SHIELD<span>X</span>
              </div>

              <div className="brand-subtitle">
                COMPLIANCE INTELLIGENCE
              </div>

            </div>

          </div>


          <div className="footer-status">

            <span className="system-dot" />

            OCR ENGINE ONLINE

          </div>

        </div>


        <div className="footer-bottom">

          <span>
            SHIELDX / AI-ASSISTED INSPECTION
          </span>

          <span>
            SEE WHAT THE LABEL HIDES.
          </span>

          <span>
            © 2026
          </span>

        </div>

      </footer>

    </main>
  );
}