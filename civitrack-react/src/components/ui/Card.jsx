import React from 'react';

const Card = ({ className = '', children }) => (
  <div className={`bg-white rounded-2xl shadow-md border border-slate-200 ${className}`.trim()}>
    {children}
  </div>
);

export default Card;
