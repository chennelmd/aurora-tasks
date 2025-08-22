import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    // Optional: report to analytics/logging here
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 16, whiteSpace: "pre-wrap" }}>
          {String(this.state.error)}
          {"\n\n"}
          {this.state.info?.componentStack || ""}
        </pre>
      );
    }
    return this.props.children;
  }
}
