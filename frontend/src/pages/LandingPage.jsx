import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  ShieldCheck,
  Zap,
  ArrowRight,
  CheckCircle2,
  Car,
  TrendingUp,
} from 'lucide-react';
import parkingService from '../services/parkingService';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatCurrency } from '../utils/formatters';

export function LandingPage() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    parkingService.getLots().then((data) => {
      setLots(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section rounded-4 p-4 p-md-5 mb-5 text-white position-relative overflow-hidden shadow-lg bg-navy-hero">
        <div className="row align-items-center position-relative z-1">
          <div className="col-lg-7">
            <div className="d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-pill bg-white bg-opacity-10 text-white text-xs mb-3 border border-white border-opacity-15">
              <Zap size={14} className="text-warning" />
              <span>Next-Gen Smart Parking System</span>
            </div>
            <h1 className="display-4 fw-bold tracking-tight mb-3">
              Find, Reserve & Park <br />
              <span className="text-accent-cyan">Without The Hassle.</span>
            </h1>
            <p className="lead text-slate-300 mb-4 max-w-xl">
              100% Software-powered parking intelligence. Reserve your guaranteed slot in seconds with automated payment holds, zero hardware sensors required.
            </p>

            <div className="d-flex flex-wrap gap-3">
              <Link to="/lots" className="btn btn-primary btn-lg rounded-3 px-4 py-2.5 fs-6 shadow-sm d-inline-flex align-items-center gap-2">
                Find Parking Now <ArrowRight size={18} />
              </Link>
              <Link to="/customer" className="btn btn-outline-light btn-lg rounded-3 px-4 py-2.5 fs-6">
                Customer Portal
              </Link>
            </div>
          </div>

          <div className="col-lg-5 mt-4 mt-lg-0 text-center">
            {/* Quick Metrics Card */}
            <div className="card border-0 bg-white bg-opacity-10 backdrop-blur rounded-4 p-4 text-start shadow-sm border border-white border-opacity-20 text-white">
              <div className="d-flex align-items-center justify-content-between mb-3 pb-3 border-bottom border-white border-opacity-10">
                <div>
                  <span className="text-2xs text-uppercase text-slate-300">Live Network</span>
                  <h4 className="fw-bold mb-0">City Parking Hub</h4>
                </div>
                <span className="badge bg-success bg-opacity-25 text-emerald border border-success border-opacity-25 px-2.5 py-1">
                  ● Real-time Sync
                </span>
              </div>

              <div className="row g-3 text-center">
                <div className="col-4">
                  <div className="p-2 rounded-3 bg-white bg-opacity-10">
                    <h3 className="fw-bold mb-0 text-emerald">68%</h3>
                    <span className="text-3xs text-slate-300 text-uppercase">Available</span>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-2 rounded-3 bg-white bg-opacity-10">
                    <h3 className="fw-bold mb-0 text-amber">10m</h3>
                    <span className="text-3xs text-slate-300 text-uppercase">Hold Window</span>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-2 rounded-3 bg-white bg-opacity-10">
                    <h3 className="fw-bold mb-0 text-accent-cyan">₹15</h3>
                    <span className="text-3xs text-slate-300 text-uppercase">Starting/hr</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-top border-white border-opacity-10 d-flex align-items-center gap-2 text-xs text-slate-300">
                <CheckCircle2 size={16} className="text-emerald flex-shrink-0" />
                <span>Zero hardware overhead — mathematical booking interval engine</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Value Props */}
      <section className="mb-5">
        <div className="text-center mb-4">
          <h3 className="fw-bold tracking-tight text-dark">Why Smart Parking?</h3>
          <p className="text-muted small">Built with high precision booking validation and transparent availability calculation</p>
        </div>

        <div className="row g-4">
          <div className="col-md-4">
            <div className="card h-100 border-0 shadow-sm rounded-4 p-4 text-center">
              <div className="mx-auto mb-3 p-3 rounded-4 bg-primary-subtle text-primary" style={{ width: 'fit-content' }}>
                <Clock size={28} />
              </div>
              <h5 className="fw-bold mb-2">Future Reservations</h5>
              <p className="text-muted small mb-0">
                Book parking for tomorrow or next week without being blocked if the slot is occupied right now.
              </p>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card h-100 border-0 shadow-sm rounded-4 p-4 text-center">
              <div className="mx-auto mb-3 p-3 rounded-4 bg-success-subtle text-success" style={{ width: 'fit-content' }}>
                <ShieldCheck size={28} />
              </div>
              <h5 className="fw-bold mb-2">Atomic Overlap Protection</h5>
              <p className="text-muted small mb-0">
                Database-level locking guarantees no double bookings. Two bookings can never claim overlapping intervals.
              </p>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card h-100 border-0 shadow-sm rounded-4 p-4 text-center">
              <div className="mx-auto mb-3 p-3 rounded-4 bg-warning-subtle text-warning" style={{ width: 'fit-content' }}>
                <Zap size={28} />
              </div>
              <h5 className="fw-bold mb-2">10-Minute Hold Window</h5>
              <p className="text-muted small mb-0">
                Temporary holds protect your chosen slot while completing payment. Expired holds automatically release slots.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Parking Lots Preview */}
      <section className="mb-5">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 className="fw-bold tracking-tight text-dark mb-1">Available Parking Hubs</h3>
            <p className="text-muted small mb-0">Choose a location and view real-time slot layout</p>
          </div>
          <Link to="/lots" className="btn btn-outline-primary btn-sm rounded-3 px-3">
            View All Lots &rarr;
          </Link>
        </div>

        {loading ? (
          <LoadingSpinner message="Loading parking locations..." />
        ) : (
          <div className="row g-4">
            {lots.slice(0, 3).map((lot) => (
              <div className="col-md-4" key={lot.id}>
                <div className="card h-100 border-0 shadow-sm rounded-4 overflow-hidden lot-card-hover transition-all">
                  <div className="position-relative" style={{ height: '170px' }}>
                    <img
                      src={lot.image_url || 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=600&q=80'}
                      alt={lot.name}
                      className="w-100 h-100 object-fit-cover"
                    />
                    <div className="position-absolute top-0 end-0 m-2.5">
                      <span className="badge bg-dark bg-opacity-75 backdrop-blur text-white px-2.5 py-1.5 rounded-pill small">
                        {formatCurrency(lot.price_per_hour)}/hr
                      </span>
                    </div>
                  </div>

                  <div className="card-body p-4 d-flex flex-column">
                    <h5 className="fw-bold text-dark mb-1">{lot.name}</h5>
                    <p className="text-muted text-xs d-flex align-items-center gap-1 mb-3">
                      <MapPin size={13} className="text-primary flex-shrink-0" /> {lot.location}
                    </p>

                    <div className="mb-3">
                      <div className="d-flex justify-content-between text-xs text-muted mb-1">
                        <span>Occupancy</span>
                        <span className="fw-semibold text-dark">{lot.occupancy_percent || 0}%</span>
                      </div>
                      <div className="progress rounded-pill" style={{ height: '6px' }}>
                        <div
                          className="progress-bar bg-primary rounded-pill"
                          role="progressbar"
                          style={{ width: `${lot.occupancy_percent || 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="d-flex gap-2 mb-3">
                      <span className="badge bg-success-subtle text-success small">
                        {lot.available_slots_count} Available Now
                      </span>
                      <span className="badge bg-light text-slate-600 small border">
                        {lot.active_slots_count || lot.total_slots} Active Slots
                      </span>
                    </div>

                    <Link
                      to={`/lots/${lot.id}`}
                      className="btn btn-primary rounded-3 w-100 mt-auto py-2 text-sm fw-medium shadow-xs"
                    >
                      View Slots & Reserve
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default LandingPage;
