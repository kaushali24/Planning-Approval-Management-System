import React from 'react';

const variants = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800',
  secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
  ghost: 'text-blue-700 hover:bg-blue-50',
};

const sizes = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm font-semibold',
  lg: 'px-5 py-3 font-semibold',
};

const Button = ({ variant = 'primary', size = 'md', className = '', children, ...props }) => {
  const variantCls = variants[variant] || variants.primary;
  const sizeCls = sizes[size] || sizes.md;
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 disabled:cursor-not-allowed ${variantCls} ${sizeCls} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
