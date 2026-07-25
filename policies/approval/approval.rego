package era.approval

default allow := false

allow if {
  input.environment == "production"
  input.risk_level == "low"
  input.rollback_available == true
  input.approver_role == "BusinessApprover"
}
