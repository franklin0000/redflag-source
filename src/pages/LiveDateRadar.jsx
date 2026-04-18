// Complete corrected content goes here

import React from 'react';

const LiveDateRadar = () => {
    return (
        <div>
            <h1>Live Date Radar</h1>
            <p>Current Date and Time: {new Date().toUTCString()}</p>
        </div>
    );
};

export default LiveDateRadar;