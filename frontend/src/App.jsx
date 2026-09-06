import { useEffect, useRef, useState } from "react";
import "./index.css";

const API_URL = "http://127.0.0.1:8000/upload";

const fieldDefinitions = [
  { key: "license_no", label: "LICENSE NUMBER" },
  { key: "marketed_by", label: "MARKETED BY" },
  { key: "mrp", label: "MRP" },
  { key: "net_weight", label: "NET WEIGHT" },
  { key: "batch_no", label: "BATCH NUMBER" },
  { key: "pkd", label: "PACKED DATE" },
  { key: "use_by", label: "USE BY / EXPIRY" },
];

function statusClass(status = "") {
  const value = String(status).toUpperCase();

  if (value === "PASS") return "pass";
  if (value === "REVIEW" || value === "NEEDS REVIEW") return "review";
  if (value === "FAIL") return "fail";

  return "neutral";
}

function PipelineStep({ number, label, active, done }) {
  return (
    <div
      className={`pipeline-step ${active ? "active" : ""} ${
        done ? "done" : ""
      }`}
    >
      <div className="pipeline-number">
        {done ? "✓" : number}
      </div>
      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value, type }) {
  return (
    <div className={`metric ${type || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ArchitectureCard({ number, icon, title, description }) {
  return (
    <div className="architecture-card">
      <div className="architecture-top">
        <span>{number}</span>
        <small>ONLINE</small>
      </div>

      <div className="architecture-icon">{icon}</div>

      <h3>{title}</h3>

      <p>{description}</p>

      <div className="architecture-line" />
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

  const loadFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("INVALID INPUT — PLEASE SELECT AN IMAGE FILE.");
      return;
    }

    setError("");
    setImage(file);

    const url = URL.createObjectURL(file);
    setPreview(url);

    setOcrText("");
    setFields({});
    setCompliance(null);
    setLoading(false);
    setAnalysisStep(0);

    setTimeout(() => {
      document
        .getElementById("inspection")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      loadFile(file);
    }

    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      loadFile(file);
    }
  };

  const removeImage = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImage(null);
    setPreview("");
    setOcrText("");
    setFields({});
    setCompliance(null);
    setLoading(false);
    setAnalysisStep(0);
    setError("");
  };

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }

      if (scanTimer.current) {
        clearInterval(scanTimer.current);
      }
    };
  }, [preview]);

  useEffect(() => {
    if (!loading) return;

    setAnalysisStep(0);

    let step = 0;

    scanTimer.current = setInterval(() => {
      step += 1;

      if (step <= 4) {
        setAnalysisStep(step);
      }
    }, 800);

    return () => {
      clearInterval(scanTimer.current);
    };
  }, [loading]);

  const analyzeProduct = async () => {
    if (!image || loading) return;

    setLoading(true);
    setError("");
    setAnalysisStep(1);

    try {
      const formData = new FormData();
      formData.append("file", image);

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(
          `SERVER ERROR ${response.status} — ANALYSIS FAILED.`
        );
      }

      const data = await response.json();

      setAnalysisStep(4);

      setOcrText(data.extracted_text || "");
      setFields(data.fields || {});
      setCompliance(data.compliance?.summary || null);

      setTimeout(() => {
        document
          .getElementById("results")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "UNABLE TO CONNECT TO THE SHIELDX ANALYSIS ENGINE."
      );
    } finally {
      setLoading(false);
    }
  };

  const summary = compliance || {};

  const coverage =
    Number(summary.verification_coverage ?? 0) || 0;

  const totalChecks = Number(summary.total_checks ?? 0);
  const passed = Number(summary.passed ?? 0);
  const review = Number(summary.needs_review ?? 0);
  const failed = Number(summary.failed ?? 0);
  const notDetected = Number(summary.not_detected ?? 0);

  const overallStatus =
    summary.status ||
    (failed > 0
      ? "FAIL"
      : review > 0
      ? "NEEDS REVIEW"
      : passed > 0
      ? "PASS"
      : "NOT DETECTED");

  const overallClass = statusClass(overallStatus);

  const checks = Array.isArray(summary.checks)
    ? summary.checks
    : [];

  const circumference = 2 * Math.PI * 56;
  const progressOffset =
    circumference - (Math.min(coverage, 100) / 100) * circumference;

  return (
    <div className="shieldx">
      {/* ============================================================
          NAVIGATION
      ============================================================ */}

      <header className="topbar">
        <a href="#home" className="brand">
          <div className="brand-symbol">
            <span />
            <span />
            <span />
          </div>

          <div>
            <strong>
              SHIELD<span>X</span>
            </strong>

            <small>COMPLIANCE INTELLIGENCE</small>
          </div>
        </a>

        <nav className="navigation">
          <a href="#home">SYSTEM</a>
          <a href="#inspection">INSPECT</a>
          <a href="#results">REPORT</a>
          <a href="#architecture">ARCHITECTURE</a>
        </nav>

        <div className="system-indicator">
          <span className="pulse-dot" />
          <span>SYSTEM OPERATIONAL</span>
        </div>
      </header>

      {/* ============================================================
          HERO
      ============================================================ */}

      <main>
        <section id="home" className="hero-section">
          <div className="hero-grid">
            <div className="hero-left">
              <div className="system-tag">
                <span>SYS.01</span>
                AI-ASSISTED LABEL INSPECTION
              </div>

              <h1>
                SEE WHAT
                <br />
                THE LABEL
                <br />
                <em>HIDES.</em>
              </h1>

              <p className="hero-description">
                ShieldX transforms a packaged-product label into a
                structured compliance report using OCR, intelligent
                field extraction and rule-based verification.
              </p>

              <div className="hero-buttons">
                <button
                  className="primary-button"
                  onClick={() =>
                    document
                      .getElementById("inspection")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  START INSPECTION
                  <b>↗</b>
                </button>

                <a href="#architecture" className="outline-button">
                  HOW IT WORKS
                </a>
              </div>

              <div className="hero-stats">
                <div>
                  <strong>OCR</strong>
                  <span>TEXT EXTRACTION</span>
                </div>

                <div>
                  <strong>AI</strong>
                  <span>FIELD DETECTION</span>
                </div>

                <div>
                  <strong>RULES</strong>
                  <span>COMPLIANCE ENGINE</span>
                </div>
              </div>
            </div>

            <div className="hero-right">
              <div className="scanner-console">
                <div className="console-top">
                  <span>SHIELDX / VISUAL INSPECTION CORE</span>
                  <span className="console-live">
                    ● LIVE SCAN
                  </span>
                </div>

                <div className="console-body">
                  <div className="scan-grid" />

                  <div className="radar-circle">
                    <div />
                  </div>

                  <div className="package-mockup">
                    <div className="package-header">
                      PRODUCT LABEL
                      <br />
                      SAMPLE / PACKAGED GOODS
                    </div>

                    <div className="package-brand">PACK</div>

                    <div className="package-line" />

                    <div className="package-info">
                      <div>
                        <small>MRP</small>
                        <strong>₹120</strong>
                      </div>

                      <div>
                        <small>NET</small>
                        <strong>500G</strong>
                      </div>

                      <div>
                        <small>LIC.</small>
                        <strong>FSSAI</strong>
                      </div>
                    </div>

                    <div className="package-footer">
                      LABEL / DATA / VERIFY
                    </div>
                  </div>

                  <div className="scanner-line" />

                  <div className="crosshair">+</div>

                  <div className="detection-box box-one">
                    <span>LICENSE NUMBER</span>
                    <b>DETECTED 98%</b>
                  </div>

                  <div className="detection-box box-two">
                    <span>MRP</span>
                    <b>DETECTED 96%</b>
                  </div>

                  <div className="detection-box box-three">
                    <span>EXPIRY DATE</span>
                    <b>REVIEW 72%</b>
                  </div>
                </div>

                <div className="console-bottom">
                  <div>
                    <span>OCR ENGINE</span>
                    <b>READY</b>
                  </div>

                  <div>
                    <span>FIELD EXTRACTION</span>
                    <b>READY</b>
                  </div>

                  <div>
                    <span>RULE ENGINE</span>
                    <b>READY</b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-footer">
            <span>SHIELDX / COMPLIANCE INTELLIGENCE</span>
            <span>PRELIMINARY AI-ASSISTED INSPECTION</span>
          </div>
        </section>

        {/* ============================================================
            INSPECTION
        ============================================================ */}

        <section id="inspection" className="inspection-section">
          <div className="section-container">
            <div className="section-header">
              <div className="section-index">01</div>

              <div>
                <div className="section-kicker">
                  INPUT / VISUAL ANALYSIS
                </div>

                <h2>
                  INSPECT
                  <br />
                  <span>THE LABEL.</span>
                </h2>
              </div>

              <p>
                Upload a product-label image. ShieldX extracts
                visible information and evaluates the detected
                fields against configured compliance rules.
              </p>
            </div>

            <div className="inspection-console">
              <div className="console-heading">
                <div>
                  <span>INPUT CHANNEL</span>
                  <strong>IMAGE / LABEL</strong>
                </div>

                <span>
                  {image ? "IMAGE LOADED" : "WAITING FOR INPUT"}
                </span>
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
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
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

                    <div className="upload-cross">+</div>

                    <strong>
                      DROP PRODUCT LABEL HERE
                    </strong>

                    <span>
                      OR CLICK TO SELECT IMAGE
                    </span>
                  </div>

                  <div className="upload-footer">
                    <span>SUPPORTED / JPG / PNG / WEBP</span>
                    <span>LOCAL PROCESSING CHANNEL</span>
                  </div>
                </div>
              ) : (
                <div className="loaded-interface">
                  <div className="image-stage">
                    <div className="image-stage-header">
                      <span>VISUAL INPUT</span>
                      <span>FRAME LOCKED</span>
                    </div>

                    <div className="image-wrapper">
                      <img
                        src={preview}
                        alt="Uploaded product label"
                      />

                      <div className="image-corner ic-tl" />
                      <div className="image-corner ic-tr" />
                      <div className="image-corner ic-bl" />
                      <div className="image-corner ic-br" />

                      {loading && (
                        <div className="image-scan-line" />
                      )}
                    </div>

                    <div className="image-stage-footer">
                      {image.name}
                    </div>
                  </div>

                  <div className="pipeline-panel">
                    <div className="pipeline-status">
                      <span className="pulse-dot" />

                      {loading
                        ? "ANALYSIS ENGINE ACTIVE"
                        : compliance
                        ? "ANALYSIS COMPLETE"
                        : "READY FOR ANALYSIS"}
                    </div>

                    <h3>
                      {loading
                        ? "SCANNING<br />LABEL DATA."
                        : compliance
                        ? "INSPECTION<br />COMPLETE."
                        : "READY TO<br />INSPECT."}
                    </h3>

                    <p>
                      {loading
                        ? "ShieldX is extracting text, identifying compliance fields and evaluating detected information."
                        : compliance
                        ? "The uploaded label has been processed. Review the generated compliance report below."
                        : "Start the analysis pipeline to extract and validate the visible label information."}
                    </p>

                    <div className="pipeline">
                      <PipelineStep
                        number="01"
                        label="IMAGE ACQUISITION"
                        done={analysisStep >= 1}
                        active={
                          loading && analysisStep === 1
                        }
                      />

                      <PipelineStep
                        number="02"
                        label="OCR TEXT EXTRACTION"
                        done={analysisStep >= 2}
                        active={
                          loading && analysisStep === 2
                        }
                      />

                      <PipelineStep
                        number="03"
                        label="FIELD IDENTIFICATION"
                        done={analysisStep >= 3}
                        active={
                          loading && analysisStep === 3
                        }
                      />

                      <PipelineStep
                        number="04"
                        label="COMPLIANCE VERIFICATION"
                        done={analysisStep >= 4}
                        active={
                          loading && analysisStep === 4
                        }
                      />
                    </div>

                    <div className="inspection-actions">
                      <button
                        className="primary-button"
                        onClick={analyzeProduct}
                        disabled={loading}
                      >
                        {loading
                          ? "ANALYZING..."
                          : compliance
                          ? "RUN AGAIN"
                          : "ANALYZE LABEL"}
                        <b>↗</b>
                      </button>

                      <button
                        className="secondary-button"
                        onClick={removeImage}
                        disabled={loading}
                      >
                        RESET
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="error-box">
                <strong>!</strong>
                <span>{error}</span>
              </div>
            )}
          </div>
        </section>

        {/* ============================================================
            RESULTS
        ============================================================ */}

        {compliance && (
          <section id="results" className="results-section">
            <div className="section-container">
              <div className="report-heading">
                <div>
                  <div className="section-kicker">
                    ANALYSIS / COMPLIANCE REPORT
                  </div>

                  <h2>
                    INSPECTION
                    <br />
                    <span>REPORT.</span>
                  </h2>
                </div>

                <div className="report-number">
                  <span>REPORT STATUS</span>
                  <strong>GENERATED</strong>
                </div>
              </div>

              <div className={`verdict-panel ${overallClass}`}>
                <div className="verdict-icon">
                  {overallClass === "pass"
                    ? "✓"
                    : overallClass === "fail"
                    ? "×"
                    : "!"}
                </div>

                <div className="verdict-main">
                  <span>PRELIMINARY SYSTEM VERDICT</span>

                  <h3>{overallStatus}</h3>
                </div>

                <div className="verdict-meta">
                  <span>FIELDS EVALUATED</span>
                  <strong>
                    {summary.evaluated_fields ?? totalChecks}
                  </strong>
                </div>
              </div>

              <div className="metrics-layout">
                <div className="coverage-panel">
                  <div className="coverage-ring">
                    <svg viewBox="0 0 120 120">
                      <circle
                        className="ring-background"
                        cx="60"
                        cy="60"
                        r="56"
                      />

                      <circle
                        className="ring-progress"
                        cx="60"
                        cy="60"
                        r="56"
                        strokeDasharray={circumference}
                        strokeDashoffset={progressOffset}
                      />
                    </svg>

                    <div>
                      <strong>
                        {Math.round(coverage)}%
                      </strong>

                      <span>COVERAGE</span>
                    </div>
                  </div>

                  <div className="coverage-label">
                    VERIFICATION COVERAGE
                    <br />
                    DETECTED REQUIRED FIELDS
                  </div>
                </div>

                <div className="metric-grid">
                  <Metric
                    label="PASSED"
                    value={passed}
                    type="pass"
                  />

                  <Metric
                    label="NEEDS REVIEW"
                    value={review}
                    type="review"
                  />

                  <Metric
                    label="FAILED"
                    value={failed}
                    type="fail"
                  />

                  <Metric
                    label="NOT DETECTED"
                    value={notDetected}
                  />
                </div>
              </div>

              <div className="report-notice">
                <div>!</div>

                <p>
                  Verification coverage indicates how many
                  required fields were detected from the
                  uploaded image. A detected field is not
                  automatically proof of legal compliance.
                  Final regulatory determination requires human
                  verification.
                </p>
              </div>

              {/* ======================================================
                  EXTRACTED INFORMATION
              ====================================================== */}

              <div className="report-block">
                <div className="block-heading">
                  <div>
                    <span>02</span>
                    <strong>EXTRACTED INFORMATION</strong>
                  </div>

                  <small>
                    OCR / STRUCTURED FIELD EXTRACTION
                  </small>
                </div>

                <div className="field-table">
                  {fieldDefinitions.map((definition, index) => {
                    const field = fields?.[definition.key];

                    const value =
                      typeof field === "object" &&
                      field !== null
                        ? field.value ??
                          field.text ??
                          field.detected_value ??
                          "NOT DETECTED"
                        : field ?? "NOT DETECTED";

                    const fieldStatus =
                      typeof field === "object" &&
                      field !== null
                        ? field.status || ""
                        : "";

                    const confidenceRaw =
                      typeof field === "object" &&
                      field !== null
                        ? field.confidence ??
                          field.score ??
                          0
                        : 0;

                    let confidence =
                      Number(confidenceRaw) || 0;

                    if (confidence <= 1) {
                      confidence *= 100;
                    }

                    confidence = Math.max(
                      0,
                      Math.min(100, confidence)
                    );

                    const detected =
                      value !== null &&
                      value !== undefined &&
                      String(value).trim() !== "" &&
                      String(value).toUpperCase() !==
                        "NOT DETECTED";

                    return (
                      <div
                        className="field-row"
                        key={definition.key}
                      >
                        <div className="field-number">
                          {String(index + 1).padStart(2, "0")}
                        </div>

                        <div className="field-label">
                          {definition.label}
                        </div>

                        <div
                          className="field-value"
                          title={String(value)}
                        >
                          {String(value)}
                        </div>

                        <div className="field-confidence">
                          <span>
                            CONFIDENCE{" "}
                            {Math.round(confidence)}%
                          </span>

                          <div>
                            <i
                              style={{
                                width: `${confidence}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div
                          className={`status-pill ${
                            statusClass(fieldStatus) ||
                            (detected ? "neutral" : "review")
                          }`}
                        >
                          <i />
                          {fieldStatus ||
                            (detected
                              ? "DETECTED"
                              : "NOT DETECTED")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ======================================================
                  COMPLIANCE CHECKS
              ====================================================== */}

              <div className="report-block">
                <div className="block-heading">
                  <div>
                    <span>03</span>
                    <strong>COMPLIANCE CHECKS</strong>
                  </div>

                  <small>
                    RULE-BASED VALIDATION ENGINE
                  </small>
                </div>

                <div className="checks-list">
                  {checks.length > 0 ? (
                    checks.map((check, index) => {
                      const status =
                        check.status ||
                        check.result ||
                        "REVIEW";

                      const fieldName =
                        check.field ||
                        check.name ||
                        check.label ||
                        "UNKNOWN FIELD";

                      const reason =
                        check.reason ||
                        check.message ||
                        check.details ||
                        "No additional explanation provided.";

                      return (
                        <div
                          className="compliance-row"
                          key={`${fieldName}-${index}`}
                        >
                          <div className="compliance-number">
                            {String(index + 1).padStart(2, "0")}
                          </div>

                          <div className="compliance-field">
                            <strong>{fieldName}</strong>
                          </div>

                          <div className="compliance-reason">
                            <p>{reason}</p>
                            <span>
                              RULE ENGINE / AUTOMATED CHECK
                            </span>
                          </div>

                          <div
                            className={`status-pill ${statusClass(
                              status
                            )}`}
                          >
                            <i />
                            {status}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="compliance-row">
                      <div className="compliance-number">
                        01
                      </div>

                      <div className="compliance-field">
                        <strong>NO CHECK DATA</strong>
                      </div>

                      <div className="compliance-reason">
                        <p>
                          The compliance engine did not return
                          individual check records.
                        </p>
                      </div>

                      <div className="status-pill neutral">
                        <i />
                        REVIEW
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ======================================================
                  OCR
              ====================================================== */}

              <div className="ocr-block">
                <div className="block-heading">
                  <div>
                    <span>04</span>
                    <strong>RAW OCR OUTPUT</strong>
                  </div>

                  <small>
                    EXTRACTED TEXT / SOURCE DATA
                  </small>
                </div>

                <pre>
                  {ocrText || "NO OCR TEXT RETURNED."}
                </pre>
              </div>

              {/* ======================================================
                  HUMAN REVIEW
              ====================================================== */}

              <div className="human-review-panel">
                <div className="review-symbol">!</div>

                <div>
                  <span>HUMAN VERIFICATION REQUIRED</span>

                  <h3>
                    AI assists inspection. It does not replace
                    regulatory judgment.
                  </h3>

                  <p>
                    ShieldX provides a preliminary,
                    AI-assisted assessment based on the visible
                    contents of the uploaded label. Regulatory
                    compliance should be confirmed by a qualified
                    human reviewer using the applicable
                    legislation and current standards.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================
            ARCHITECTURE
        ============================================================ */}

        <section
          id="architecture"
          className="system-section"
        >
          <div className="section-container">
            <div className="system-heading">
              <div className="section-index">05</div>

              <div>
                <div className="section-kicker">
                  SYSTEM / ARCHITECTURE
                </div>

                <h2>
                  BUILT TO
                  <br />
                  <span>VERIFY.</span>
                </h2>
              </div>
            </div>

            <div className="architecture">
              <ArchitectureCard
                number="01"
                icon="◉"
                title="IMAGE INPUT"
                description="Secure visual intake for packaged-product labels and regulatory information."
              />

              <ArchitectureCard
                number="02"
                icon="⌁"
                title="OCR ENGINE"
                description="Converts visible label content into machine-readable text for downstream analysis."
              />

              <ArchitectureCard
                number="03"
                icon="◇"
                title="FIELD AI"
                description="Identifies important product attributes such as license, MRP, dates and quantity."
              />

              <ArchitectureCard
                number="04"
                icon="✓"
                title="RULE ENGINE"
                description="Evaluates detected fields against configured compliance requirements."
              />
            </div>

            <div className="capability-strip">
              <div>
                <strong>IMAGE → DATA</strong>
                <span>VISUAL EXTRACTION</span>
              </div>

              <div>
                <strong>DATA → FIELDS</strong>
                <span>STRUCTURED OUTPUT</span>
              </div>

              <div>
                <strong>FIELDS → RULES</strong>
                <span>COMPLIANCE VALIDATION</span>
              </div>

              <div>
                <strong>RULES → REPORT</strong>
                <span>HUMAN-READY RESULT</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ============================================================
          FOOTER
      ============================================================ */}

      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="brand-symbol">
              <span />
              <span />
              <span />
            </div>

            <div>
              <strong>
                SHIELD<span>X</span>
              </strong>

              <p>
                Compliance intelligence for packaged-product
                labels.
              </p>
            </div>
          </div>

          <div className="footer-status">
            <span>SYSTEM STATUS</span>
            <strong>● OPERATIONAL</strong>
          </div>

          <div className="footer-bottom">
            <span>
              SHIELDX / COMPLIANCE INTELLIGENCE
            </span>

            <span>
              AI-ASSISTED / HUMAN VERIFIED
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}