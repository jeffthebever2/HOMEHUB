const STATUS_CLASS_MAP = {
  normal: 'hh-badge-neutral',
  info: 'hh-badge-info',
  success: 'hh-badge-success',
  warning: 'hh-badge-warning',
  urgent: 'hh-badge-urgent',
  danger: 'hh-badge-danger',
  offline: 'hh-badge-offline',
  error: 'hh-badge-offline',
};

export function badgeClass(status = 'normal') {
  return STATUS_CLASS_MAP[status] || STATUS_CLASS_MAP.normal;
}
