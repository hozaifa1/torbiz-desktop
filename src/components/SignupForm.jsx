import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import GoogleLoginButton from './GoogleLoginButton';
import { Eye, EyeOff } from 'lucide-react';

function SignupForm() {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false); // State for the checkbox
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { signup } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (!termsAccepted) {
            setError('You must accept the terms and conditions to sign up.');
            return;
        }


        try {
            await signup(username, email, password, confirmPassword);
            setSuccess('Registration successful! You can now log in.');
        } catch (err) {
            const errorData = err.response?.data;
            const errorMsg = (errorData && (errorData.username || errorData.email || errorData.error)) || 'Failed to sign up.';
            setError(Array.isArray(errorMsg) ? errorMsg[0] : errorMsg);
            console.error(err);
        }
    };

    return (
        <form className="column" onSubmit={handleSubmit}>
            {error && <p className="auth-error">{error}</p>}
            {success && <p className="auth-success">{success}</p>}
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="password-input-wrapper">
                <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>
            <div className="password-input-wrapper">
                <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                <button type="button" className="password-toggle-btn" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
            </div>

            <div className="terms-checkbox-wrapper">
              <input 
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <label htmlFor="terms">
                I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>
              </label>
            </div>

            <button type="submit">Sign Up</button>
            <div className="separator">OR</div>
            <GoogleLoginButton />
        </form>
    );
}

export default SignupForm;