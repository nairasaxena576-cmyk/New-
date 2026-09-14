import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Wifi, SlidersHorizontal, Zap } from 'lucide-react';

const explanations = [
  {
    icon: Wifi,
    color: 'bg-violet-100 text-violet-600',
    title: 'Remote Work',
    text: 'Work from anywhere with the tools and support you need to succeed.',
  },
  {
    icon: SlidersHorizontal,
    color: 'bg-pink-100 text-pink-600',
    title: 'Flexibility',
    text: 'Flexible schedules and adaptive strategies for better productivity.',
  },
  {
    icon: Zap,
    color: 'bg-teal-100 text-teal-600',
    title: 'Adhocracy',
    text: 'Innovative solutions and quick actions to seize opportunities.',
  },
];

export function PhilosophySection() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm"
    >
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-2 lg:items-center lg:gap-10 lg:p-10">
        {/* Left: text */}
        <div className="order-2 lg:order-1">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-500">
            Our Core Philosophy
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            <span className="text-violet-600">Growth</span>{' '}
            <span className="text-slate-800">With</span>{' '}
            <span className="text-teal-500">Balance</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500 sm:text-base">
            At Hawksem, we combine Remote Work, Flexibility, and Adhocracy to
            deliver smarter growth strategies and real results for you.
          </p>

          <button
            onClick={() => navigate('/account')}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 hover:shadow-md"
          >
            Learn More About Us
            <ArrowRight className="size-4" />
          </button>

          {/* Explanations */}
          <div className="mt-8 space-y-4">
            {explanations.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.3 + i * 0.12 }}
                  className="flex items-start gap-3"
                >
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}>
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:text-sm">
                      {item.text}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Center: reference philosophy image */}
        <div className="order-1 flex justify-center lg:order-2">
          <div className="w-full max-w-[430px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
            <img
              src="/assets/images/image copy 7.png"
              alt="Hawksem core philosophy: Remote Work, Flexibility, and Adhocracy"
              className="block aspect-square w-full object-cover"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
